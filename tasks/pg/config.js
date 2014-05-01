(function () {
  'use strict';

  /**
   * Compile config vars for postgres setup
   */
  var pgconfig = exports;

  var lib = require('../../lib'),
    pghba = require('./hba'),
    exec = require('execSync').exec,
    os = require('os'),
    fs = require('fs'),
    path = require('path'),
    format = require('string-format'),
    _ = require('lodash');
  
  _.extend(pgconfig, lib.task, /** @exports pgconfig */ {

    defaults: {
      locale: 'en_US.UTF-8',
      max_connections: 64,
      work_mem: 1,
      temp_buffers: 16,
      shared_buffers: 64,
      effective_cache_size: 256,
      max_stack_depth: 4,
      max_locks_per_transaction: 1024
    },

    options: {
      host: {
        optional: '[host]',
        description: 'Postgres server host address',
        value: 'localhost'
      },
      version: {
        optional: '[version]',
        description: 'Version of postgres to install',
        value: '9.3'
      },
      locale: {
        optional: '[string]',
        value: 'en_US.UTF-8',
        description: 'Cluster locale'
      },
      timezone: {
        optional: '[integer]',
        description: 'Integer offset from UTC; e.g., "-7" is PDT, "-8" is PST, etc',
        value: 'localtime'
      },
    },

    /** @override */
    beforeInstall: function (options) {
      if (os.totalmem() < (2 * 1048576)) {
        throw new Error('This machine has insufficient RAM');
      }
      options.pg.config || (options.pg.config = { });
    },

    /** @override */
    beforeTask: function (options) {
      exec('usermod -a -G ssl-cert postgres');
    },

    /** @override */
    doTask: function (options) {
      pgconfig.writePostgresqlConfig(options);
    },

    /**
     * Find the existing cluster that corresponds to our options, if it exists,
     * and set options.pg.cluster
     */
    discoverCluster: function (options) {
      options.pg.cluster = _.findWhere(lib.pgCli.lsclusters(), {
        name: options.xt.name,
        version: options.pg.version
      });
    },

    /**
     * Write the postgresql.conf file
     */
    writePostgresqlConfig: function (options) {
      _.defaults(options.pg.config, options.pg.cluster, {
        name: options.xt.name,
        version: options.pg.version,
        timezone: options.pg.timezone,
        data_directory: options.pg.cluster.data,
        ssl_cert_file: options.pg.outcrt,
        ssl_key_file: options.pg.outkey,
        ssl_ca_file: options.nginx.outcrt
      });

      var targetPath = path.resolve(options.pg.cluster.config, 'postgresql.conf'),
        templateFile = path.resolve(__dirname, 'postgresql-{pg.version}.conf.template'.format(options)),
        template = fs.readFileSync(templateFile).toString(),
        conf = template.format(options.pg.config);

      fs.writeFileSync(targetPath, conf);
    }
  });
})();
