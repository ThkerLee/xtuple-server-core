(function () {
  'use strict';

  /**
   * Setup machine access policies.
   */
  var policy = exports;

  var task = require('../../lib/task'),
    fs = require('fs'),
    rimraf = require('rimraf'),
    exec = require('execSync').exec,
    path = require('path'),
    _ = require('lodash'),
    global_policy_filename = 'XT00-xtuple-global-policy',
    user_policy_filename = 'XT10-xtuple-user-policy',
    sudoers_d = path.resolve('/etc/sudoers.d');

  _.extend(policy, task, /** @exports policy */ {

    /** @override */
    beforeTask: function (options) {
      // if customer appears new, that is they've provided no main database,
      // snapshot to restore from, or admin password, generate a admin password
      //console.log('generating adminpw: ', (!options.xt.adminpw && !options.pg.restore && !options.xt.maindb));
      if (!options.xt.adminpw && !options.pg.restore && !options.xt.maindb) {
        options.xt.adminpw = policy.getPassword();
      }

      if (exec('id -u xtremote').code !== 0) {
        options.sys.policy.remotePassword = policy.getPassword();
      }

      if (exec('id -u {xt.name}'.format(options)).code !== 0) {
        options.sys.policy.userPassword = policy.getPassword();
      }
    },

    /** @override */
    doTask: function (options) {
      if (exec('id -u {xt.name}'.format(options)).code !== 0) {
        policy.createUsers(options);
        policy.configureSSH(options);
      }
    },

    /** @override */
    afterInstall: function (options) {
      exec('rm -f ~/.pgpass');
      exec('rm -f ~/.bash_history');
      exec('rm -f /root/.bash_history');

      exec('chmod a-w {xt.configdir}/install-arguments.json'.format(options));
    },

    /** @override */
    afterTask: function (options) {
      exec('service ssh reload');
    },

    getPassword: function () {
      return exec('openssl rand 6 | base64').stdout.replace(/\W/g, '');
    },

    /**
     * Create users and set permissions
     * @private
     */
    createUsers: function (options) {
      var xt = options.xt,
        global_policy_src = fs.readFileSync(path.resolve(__dirname, global_policy_filename)).toString(),
        global_policy_target = path.resolve(sudoers_d, global_policy_filename),
        user_policy_src = fs.readFileSync(path.resolve(__dirname, user_policy_filename)).toString(),
        user_policy_target = path.resolve(
          sudoers_d,
          user_policy_filename.replace('user', '{xt.name}').format(options)
        ),
        system_users = [
          'addgroup xtuser',
          'addgroup xtadmin',
          'useradd xtremote -p {sys.policy.remotePassword}'.format(options),
          'adduser xtadmin --disabled-login',
          'usermod -a -G xtadmin,xtuser,www-data,postgres,lpadmin,ssl-cert xtremote',
          'usermod -a -G ssl-cert,xtuser postgres',
        ],
        xtuple_users = [
          'useradd {xt.name} -d /usr/local/{xt.name} -p {sys.policy.userPassword}'.format(options),
          'usermod -a -G postgres,xtuser {xt.name}'.format(options),
          'chage -d 0 {xt.name}'.format(options)
        ],
        system_ownership = [
          'chown -R xtadmin:xtuser /etc/xtuple',
          'chown -R xtadmin:xtuser /var/log/xtuple',
          'chown -R xtadmin:xtuser /var/lib/xtuple',
          'chown -R xtadmin:xtuser /usr/sbin/xtuple',
          'chown -R xtadmin:xtuser /usr/local/xtuple',
          'chown -R postgres:xtuser /var/run/postgresql'
        ],
        system_mode = [
          'chmod -R g=x,o-wr /etc/xtuple/',
          'chmod -R g=rx,u=rwx,o-wr /var/lib/xtuple',
          'chmod -R g=rx,u=rwx,o=rx /usr/sbin/xtuple',
          'chmod -R g=rx,u=rwx,o=rx /usr/local/xtuple',
          'chmod -R g=rwx,u=rwx,o=rx /usr/local/xtuple/.pm2',
          'chmod -R g+wrx /var/run/postgresql'
        ],
        user_ownership = [
          'chown -R :xtuser {pg.logdir}'.format(options),
          'chown -R {xt.name}:xtuser {xt.logdir}'.format(options),
          'chown -R {xt.name}:xtuser {xt.configdir}'.format(options),
          'chown -R {xt.name}:xtuser {sys.servicedir}'.format(options),
          'chown -R {xt.name}:xtuser {xt.statedir}'.format(options),
          'chown -R {xt.name}:xtuser {xt.rundir}'.format(options),
          'chown -R {xt.name}:xtuser {sys.sbindir}'.format(options),
          'chown -R {xt.name}:ssl-cert {xt.ssldir}'.format(options)
        ],
        user_mode = [
          'chmod -R u=rwx,g=wx {xt.logdir}'.format(options),
          'chmod -R u=rwx,g=wx {pg.logdir}'.format(options),
          'chmod -R u=rwx,g-rwx {xt.statedir}'.format(options),
          'chmod -R g=rx,u=wrx,o-rwx {xt.ssldir}'.format(options),
          'chmod -R g=rwx,u=wrx,o-rw {xt.configdir}'.format(options)
        ],
        system_users_results,
        system_access_results,
        xtuple_users_results,
        xtuple_access_results,
        sudoers_chmod, visudo_cmd;

      // create system users
      if (options.sys.policy.remotePassword) {
        system_users_results = _.map(system_users, exec);
        system_access_results = _.map(_.flatten([ system_ownership, system_mode ]), exec);
        var htpasswd = exec('htpasswd -cb {sys.htpasswdfile} xtremote {sys.policy.remotePassword}'.format(options));
        if (htpasswd.code !== 0) {
          throw new Error(htpasswd.stdout);
        }
      }

      // create *this* user, and set access rules
      if (options.sys.policy.userPassword) {
        xtuple_users_results = _.map(xtuple_users, exec);
        xtuple_access_results = _.map(_.flatten([ user_ownership, user_mode ]), exec);
      }

      // write sudoers file
      if (!fs.existsSync(global_policy_target)) {
        fs.writeFileSync(global_policy_target, global_policy_src);
      }
      if (!fs.existsSync(user_policy_target)) {
        fs.writeFileSync(user_policy_target, user_policy_src.format(options));
      }

      // set correct permissions (enforced by OS)
      sudoers_chmod = exec('chmod 440 /etc/sudoers.d/*');
      if (sudoers_chmod.code !== 0) {
        throw new Error(JSON.stringify(sudoers_chmod, null, 2));
      }

      // validate sudoers files
      visudo_cmd = exec('visudo -c');
      if (visudo_cmd.code !== 0) {
        throw new Error(JSON.stringify(visudo_cmd, null, 2));
      }

      // set user shell to bash
      exec('sudo chsh -s /bin/bash {xt.name}'.format(options));
    },

    /**
     * Configure SSH remote access rules.
     * @private
     */
    configureSSH: function  (options) {
      var src_sshd_conf = fs.readFileSync('/etc/ssh/sshd_config').toString(),
        rules = {
          UseDNS: 'no',
          PermitRootLogin: 'no',
          // AllowGroups: 'xtadmin xtuser', TODO solve riskiness of installing over ssh
          LoginGraceTime: '30s',
          X11Forwarding: 'no',
          PubkeyAuthentication: 'no',
          HostbasedAuthentication: 'no'
        },
        target_sshd_conf = _.reduce(_.keys(rules), function (memo, key) {
          var regex = new RegExp('^' + key + '.*$', 'gm'),
            entry = key + ' ' + rules[key],
            match = regex.exec(memo);

          return match ? memo.replace(match, entry) : memo.concat(entry + '\n');
        }, src_sshd_conf);

      fs.writeFileSync('/etc/ssh/sshd_config.bak.' + new Date().valueOf(), src_sshd_conf);
      fs.writeFileSync('/etc/ssh/sshd_config', target_sshd_conf);
    },

    /** @override */
    uninstall: function (options) {
      exec('skill -KILL -u {xt.name}'.format(options));
      //exec('skill -KILL -u xtremote'.format(options));
      exec('deluser {xt.name}'.format(options));
      exec('deluser xtremote');
      exec('rm -rf /usr/local/{xt.name}/{xt.version}/xtuple*'.format(options));
      exec('rm -f '+ path.resolve('/etc/sudoers.d/', user_policy_filename.replace('user', '{xt.name}').format(options)));
    }
  });

})();
