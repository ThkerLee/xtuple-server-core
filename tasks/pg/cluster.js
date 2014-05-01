(function () {
  'use strict';

  /**
   * Create a new postgres cluster and prime it to the point of being able
   * to receive import of xtuple databases.
   */
  var cluster = exports;

  var lib = require('../../lib'),
    exec = require('execSync').exec,
    path = require('path'),
    _ = require('lodash');

  _.extend(cluster, lib.task, /** @exports cluster */ {

    /** @override */
    beforeInstall: function (options) {
      var clusters = lib.pgCli.lsclusters(),
        exists = _.findWhere(clusters, {
          name: options.xt.name,
          version: parseFloat(options.pg.version)
        });

      if (exists) {
        throw new Error('cluster configuration already exists');
      }

      options.pg.configdir = path.resolve('/etc/postgresql', options.pg.version, options.xt.name);
    },

    /** @override */
    doTask: function (options) {
      _.extend(options.pg.cluster, lib.pgCli.createcluster(options), { name: options.xt.name });
      lib.pgCli.ctlcluster({ action: 'restart', version: options.pg.version, name: options.xt.name });

      cluster.initCluster(options);
      lib.pgCli.ctlcluster({ action: 'reload', version: options.pg.version, name: options.xt.name });
    },

    /** @override */
    uninstall: function (options) {
      lib.pgCli.dropcluster({ name: options.xt.name, version: options.pg.version });
    },

    /**
     * Setup an existing, empty-ish cluster to receive xtuple.
     */
    initCluster: function (options) {
      lib.pgCli.createdb(_.extend({ dbname: options.xt.name, owner: options.xt.name }, options));

      // Docs: <http://www.postgresql.org/docs/9.3/static/sql-createrole.html>
      var queries = [
          'CREATE EXTENSION plv8',

          // create xtrole
          'CREATE ROLE xtrole',

          // create 'admin' user (default xtuple client admin)
          'CREATE ROLE admin WITH LOGIN PASSWORD \'{xt.adminpw}\' SUPERUSER'.format(options),

          // create 'postgres' role for convenience
          'CREATE ROLE postgres LOGIN SUPERUSER',

          'GRANT xtrole TO admin',
          'GRANT xtrole TO {xt.name}'.format(options)
        ],
        results = _.map(queries, _.partial(lib.pgCli.psql, options)),
        failed = _.difference(results, _.where(results, { code: 0 }));

      if (failed.length > 0) {
        throw new Error(JSON.stringify(failed, null, 2));
      }
    }
  });

})();
