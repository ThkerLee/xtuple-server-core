var lib = require('xtuple-server-lib'),
  semver = require('semver'),
  mkdirp = require('mkdirp'),
  _ = require('lodash'),
  exec = require('child_process').execSync,
  fs = require('fs'),
  path = require('path');

_.extend(exports, lib.task, /** @exports xtuple-server-xt-install */ {

  /** @override */
  beforeInstall: function (options) {
    options.xt.scalarversion = options.xt.version.replace(/\./g, '');
  },

  /** @override */
  beforeTask: function (options) {
    if (lib.util.isTaggedVersion(options)) {
      options.xt.repoHash = 'v' + options.xt.version;
    }
    else {
      options.xt.repoHash = options.xt.version.slice(0, 6);
    }
  },

  /** @override */
  executeTask: function (options) {
    if (_.isObject(options.local) && !_.isEmpty(options.local.workspace)) {
      return;
    }

    _.each(lib.util.getRepositoryList(options), function (repo) {
      var clonePath = path.resolve(options.xt.dist, repo),
          deployPath = path.resolve(options.xt.userdist, repo);

      if (!fs.existsSync(clonePath)) {
        var clone = exec([ 'git clone --recursive https://github.com/xtuple/' + repo + '.git', clonePath].join(' ')),
          checkout = exec([ 'cd', clonePath, '&& git fetch origin && git checkout', options.xt.repoHash ].join(' '));

    /*
        if (clone.status !== 0) {
          throw new Error(JSON.stringify(clone, null, 2));
        }
        */
      }

      if (!fs.existsSync(deployPath)) {
        try {
          exec('n '+ options.n.version);
          var npmInstall = exec([ 'cd', clonePath, '&& npm install' ].join(' ')).toString();
          log.verbose('xt.install executeTask', npmInstall);
        }
        finally {
          exec('n latest');
        }

        if (!fs.existsSync(deployPath)) {
          mkdirp.sync(deployPath);
        }
        // copy main repo files to user's home directory
        var rsync = exec([ 'rsync -ar --exclude=.git', clonePath + '/*', deployPath ].join(' '));
          
        /*
        if (rsync.status !== 0) {
          throw new Error(JSON.stringify(rsync, null, 2));
        }
        */

        exec([ 'chown -R', options.xt.name, deployPath ].join(' '));
        exec('chmod -R u=rwx ' + deployPath);
      }
    });
  },

  /**
   * Return the node.js version specified in the package.json of the main
   * xtuple repo.
   */
  getPackageNodeVersion: function (options) {
    var pkg = require(path.resolve(options.xt.coredir, 'package')),
      node = pkg.engines.node;

    return exports.crudeVersionResolve(node);
  },

  crudeVersionResolve: function (version) {
    if (!semver.validRange(version)) {
      throw new Error('xtuple package version does not seem to be valid: '+ version);
    }

    // TODO remove
    if ('0.8.x' === version) {
      return '0.8.26';
    }
    else {
      return semver.clean(version);
    }
  },

  /** @override */
  afterTask: function (options) {
    exec([
      'chown -R',
      options.xt.name + ':' + options.xt.name,
      options.xt.userhome
    ].join(' '));
  }
});
