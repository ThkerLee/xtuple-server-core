var lib = require('xtuple-server-lib'),
  rimraf = require('rimraf'),
  _ = require('lodash'),
  exec = require('execSync').exec,
  path = require('path'),
  fs = require('fs');

/**
 * Build the specified xTuple database(s)
 */
_.extend(exports, lib.task, /** @exports xtuple-server-xt-database */ {

  options: {
    version: {
      optional: '[version]',
      description: 'xTuple Version',
      validate: function (value, options) {
        if (_.isEmpty(value)) {
          return require(path.resolve(options.local.workspace, 'package')).version;
        }
        if (_.isNumber(parseInt(value, 16))) {
          return value;
        }
        if (semver.valid(value)) {
          return value;
        }

        throw new TypeError('Specified version is not valid: '+ value);
      }
    },
    name: {
      optional: '[name]',
      description: 'Name of the installation',
      validate: function (value) {
        if (_.isEmpty(value)) {
          return process.env.SUDO_USER;
        }
        if (/\d/.test(value)) {
          throw new Error('xt.name cannot contain numbers');
        }
      }
    },
    maindb: {
      optional: '[path]',
      description: 'Path to primary database .backup/.sql filename to use in production',
      validate: function (value) {
        if (!_.isEmpty(value) && !fs.existsSync(path.resolve(value))) {
          throw new Error('Invalid path for xt.maindb: '+ value);
        }

        return value;
      }
    },
    edition: {
      optional: '[string]',
      description: 'The xTuple Edition to install',
      value: 'core'
    },
    demo: {
      optional: '[boolean]',
      description: 'Set to additionally install the demo databases',
      value: false
    },
    quickstart: {
      optional: '[boolean]',
      description: 'Set to additionally install the quickstart databases',
      value: false
    },
    adminpw: {
      optional: '[password]',
      description: 'Password for the database "admin" user for a new database'
    }
  },

  /** @override */
  beforeInstall: function (options) {
    var foundationPath = path.resolve(options.xt.usersrc, 'foundation-database'),
      databases = [ ],
      maindb_path;

    if (options.xt.demo) {
      databases.push({
        dbname: 'xtuple_demo',
        filename: path.resolve(foundationPath, 'postbooks_demo_data.sql'),
        foundation: true
      });
    }
    if (options.xt.quickstart) {
      databases.push({
        dbname: 'xtuple_quickstart',
        filename: path.resolve(foundationPath, 'quickstart_data.sql'),
        foundation: true
      });
    }

    // schedule main database file for installation
    if (!_.isEmpty(options.xt.maindb)) {
      maindb_path = path.resolve(options.xt.maindb);
      if (fs.existsSync(maindb_path)) {
        databases.push({
          filename: maindb_path,
          dbname: options.xt.name + lib.util.getDatabaseNameSuffix(options),
          foundation: false
        });
      }
      else {
        throw new Error('Database File not found; expected to find '+ maindb_path);
      }
    }

    if (databases.length === 0) {
      throw new Error('No databases have been found for installation');
    }

    options.xt.database.list = databases;
  },

  /** @override */
  executeTask: function (options) {
    if (options.xt.database.list.length === 0) {
      throw new Error('No databases are scheduled to be installed');
    }

    exports.buildFoundationDatabases(options);
    exports.buildMainDatabases(options);
  },

  buildMainDatabases: function (options) {
    var xt = options.xt,
      extensions = lib.util.editions[xt.edition],
      databases = _.where(xt.database.list, { foundation: false });

    // build the main database, if specified
    _.each(databases, function (db) {
      rimraf.sync(path.resolve(options.xt.usersrc, 'scripts/lib/build'));

      var buildResult = exec(lib.util.getCoreBuildCommand(db, options));
      if (buildResult.code !== 0) {
        throw new Error(buildResult.stdout);
      }

      // install extensions specified by the edition
      _.each(extensions, function (ext) {
        var result = exec(lib.util.getExtensionBuildCommand(db, options, ext));
        if (result.code !== 0) {
          throw new Error(result.stdout);
        }
      });
    });
  },

  buildFoundationDatabases: function (options) {
    var quickstart = _.findWhere(options.xt.database.list, { dbname: 'xtuple_quickstart' }),
      demo = _.findWhere(options.xt.database.list, { dbname: 'xtuple_demo' }),
      qsBuild, demoBuild;

    rimraf.sync(path.resolve(options.xt.usersrc, 'scripts/lib/build'));
    if (quickstart) {
      qsBuild = exec(lib.util.getSourceBuildCommand(quickstart, options));

      if (qsBuild.code !== 0) {
        throw new Error(JSON.stringify(qsBuild));
      }
    }
    if (demo) {
      demoBuild = exec(lib.util.getSourceBuildCommand(demo, options));

      if (demoBuild.code !== 0) {
        throw new Error(JSON.stringify(demoBuild));
      }
    }
  }
});
