var assert = require('chai').assert,
  _ = require('underscore'),
  fs = require('fs'),
  path = require('path'),
  exec = require('execSync').exec,
  nginxModule = require('../../tasks/nginx'),
  options = global.options;

it('should add an entry in /etc/hosts', function () {
  var etchosts = fs.readFileSync('/etc/hosts').toString();

  assert.match(etchosts, new RegExp(options.nginx.sitename));
});
