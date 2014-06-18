var lib = require('xtuple-server-lib'),
  config = require('xtuple-server-pg-config'),
  _ = require('lodash'),
  path = require('path');

/**
 * Create a new postgres cluster and prime it to the point of being able
 * to receive import of xtuple databases.
 */
_.extend(exports, lib.task, /** @exports cluster */ {

  options: {
    pilot: {
      optional: '[boolean]',
      description: 'Additionally create a pilot cluster',
      value: false
    }
  },

  /** @override */
  beforeInstall: function (options) {
    options.pg.cluster = {
      owner: options.xt.name,
      name: lib.util.getClusterName(options),
      version: parseFloat(options.pg.version)
    };
    var exists = _.findWhere(lib.pgCli.lsclusters(), options.pg.cluster);

    if (exists) {
      throw new Error('Cluster already exists: ' + options.pg.cluster);
    }
    options.pg.configdir = path.resolve('/etc/postgresql', options.pg.version, options.xt.name);
  },

  /** @override */
  executeTask: function (options) {
    _.extend(options.pg.cluster, lib.pgCli.createcluster(options));
    lib.pgCli.ctlcluster(options, 'restart');
    exports.initCluster(options);
  },

  /** @override */
  uninstall: function (options) {
    config.discoverCluster(options);

    if (/uninstall/.test(options.planName)) {
      lib.pgCli.ctlcluster(options, 'stop');
      lib.pgCli.dropcluster(options);
    }
  },

  /**
   * Setup an existing, empty-ish cluster to receive xtuple.
   */
  initCluster: function (options) {
    lib.pgCli.createdb(options, options.xt.name, options.xt.name);

    // <http://www.postgresql.org/docs/9.3/static/sql-createrole.html>
    var queries = [
        'CREATE EXTENSION IF NOT EXISTS plv8',
        'CREATE EXTENSION IF NOT EXISTS plpgsql',
        'CREATE EXTENSION IF NOT EXISTS hstore',

        // create 'admin' user (this is the default xtuple admin user)
        'CREATE ROLE admin WITH LOGIN PASSWORD \'{xt.adminpw}\' SUPERUSER'.format(options),

        // TODO revisit when xtuple/xtuple#1472 is resolved
        //'CREATE ROLE admin WITH LOGIN PASSWORD \'{xt.adminpw}\' CREATEDB CREATEROLE INHERIT'.format(options),

        // create xtrole
        'CREATE ROLE xtrole WITH ROLE admin',

        // create xtremote, xtpilot, and xtlive roles for purposes TBD
        'CREATE ROLE xtremote',
        'CREATE ROLE xtpilot',
        'CREATE ROLE xtlive',

        // create 'postgres' role for convenience + compatibility
        'CREATE ROLE postgres LOGIN SUPERUSER',

        'GRANT xtpilot TO admin',
        'GRANT xtremote TO admin',
        'GRANT xtlive TO admin',
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
