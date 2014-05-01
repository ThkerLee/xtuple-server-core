(function () {
  'use strict';

  /**
   * Collection of pg CLI utilities
   */
  var cli = exports;

  var exec = require('execSync').exec,
    format = require('string-format'),
    fs = require('fs'),
    _ = require('lodash'),
    os = require('os');

  _.extend(cli, /** @exports cli */ {

    parse_rules: {
      'pg_createcluster': {
        keyvalue: true,
        shift: 1
      },
      'pg_lsclusters': {
        header: ['version', 'name', 'port', 'status', 'owner', 'data', 'log'],
        shift: 1
      },
      'pg_hba': {
        header: ['type', 'database', 'user', 'address', 'method']
      }
    },

    /**
     * Run the given query using psql as superuser (postgres)
     * @public
     * @param query
     */
    psql: function (options, query) {
      var cmd = [
        'sudo -u {xt.name} /usr/lib/postgresql/{pg.version}/bin/psql',
        '{dbname}',
        '-U {xt.name}',
        '-p {pg.cluster.port}',
        '-c "{query};"'
      ]
      .join(' ')
      .format(_.extend({ query: query }, options));

      return exec(cmd);
    },

    /**
     * Restore database from backup file/directory
     * @param filename
     * @param dbname
     */
    restore: function (options) {
      options.pg.restoreThreads = Math.ceil(os.cpus().length / 2);

      cli.createdb(options, options.xt.name, options.dbname);

      var pg_restore = [
          'sudo -u {xt.name} /usr/lib/postgresql/{pg.version}/bin/pg_restore',
          '-U {xt.name}',
          '-p {pg.cluster.port}',
          '-j {pg.restoreThreads}',
          '--create --clean',
          '-d {dbname}',
          '{filename}'
        ].join(' ').format(options),
        result = exec(pg_restore);

      if (result.code !== 0 && !/WARNING: errors ignored on restore: /.test(result.stdout)) {
        throw new Error(result.stdout);
      }

      return result;
    },

    dump: function (params) {
      throw new Error('TODO implement');

    },
    
    dumpall: function (params) {
      throw new Error('TODO implement');

    },

    /**
     * Create a new database in a cluster
     * @param owner
     * @param dbname
     */
    createdb: function (options, owner, dbname) {
      var cmd = [
          'sudo -u {xt.name} /usr/lib/postgresql/{pg.version}/bin/createdb',
          '{dbname}',
          '-U {xt.name}',
          '-O {owner}',
          '-p {pg.cluster.port}'
        ].join(' ').format(_.extend({ owner: owner, dbname: dbname }, options)),
        result = exec(cmd);

      return result;
    },

    /** @static */
    createcluster: function (options) {
      var cmd = 'pg_createcluster {pg.version} {xt.name} --user {xt.name} --socketdir /var/run/postgresql'
          .format(options),
        result = exec(cmd);

      if (/Usage:/.test(result)) {
        throw new Error('pg_createcluster missing arguments');
      }
      if (result.code) {
        throw new Error(JSON.stringify({ cmd: cmd, stdout: result.stdout }));
      }

      return _.extend(
        { version: options.pg.version },
        cli.parse(result.stdout, 'pg_createcluster')
      );
    },

    /** @static */
    lsclusters: function () {
      var result = exec('pg_lsclusters');

      if (result.code !== 0) {
        throw new Error(result.stdout);
      }

      return _.map(cli.parse(result.stdout, 'pg_lsclusters'), function (cluster) {
        return _.extend(cluster, {
          config: '/etc/postgresql/{version}/{name}'.format(cluster),
          version: ''+ cluster.version
        });
      });
    },

    /** @static */
    ctlcluster: function (params) {
      var result = exec('sudo -u {name} pg_ctlcluster {version} {name} {action}'.format(params));

      if (result.code === 1 || result.code > 2) {
        throw new Error(result.stdout);
      }

      return result;
    },

    /** @static */
    dropcluster: function (params) {
      var result = exec('pg_dropcluster {version} {name} --stop'.format(params));

      if (result.code !== 0) {
        throw new Error(result.stdout);
      }

      return result;
    },

    /** @static */
    parse: function (result, cmd) {
      var options = cli.parse_rules[cmd],
        matrix = _.compact(_.map((result || '').trim().split('\n'), function (row) {
          return row.trim() ? row.trim().split(/\s+/) : null;
        })),
        header;

      if (_.isNumber(options.shift)) {
        matrix = _.rest(matrix, options.shift);
      }
      header = _.isArray(options.header) ? options.header : matrix[0];
      
      if (options.keyvalue) {
        return _.object(matrix);
      }
      if (_.isArray(options.header)) {
        header = options.header;
      }
      return _.map(matrix, function (row) {
        return _.object(header, _.map(row, _toNumber));
      });
    }
  });

  /**
   * @static
   * @private
   */
  function _toNumber (str) {
    var f = parseFloat(str), i = parseInt(str, 10);
    if (isNaN(f) || !isFinite(str)) {
      return str;
    }
    return (f !== i) ? f : i;
  }

})();
