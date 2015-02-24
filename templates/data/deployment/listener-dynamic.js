#!/usr/bin/env node

// {{ ansible_managed }}

var cluster = require('cluster'),
  fs = require('fs'),
  port = 30080;

function record_pidfile_at(pidfile_path) {
  try {
    var pid = require('npid').create(pidfile_path);
    pid.removeOnExit();
  } catch(error) {
    console.log(error);
    process.exit(1);
  }
}

if (cluster.isMaster) {
  record_pidfile_at('{{ autodeploy_pidfile_path }}');
  cluster.on('exit', function(worker, code, signal) {
    cluster.fork();
  });
  cluster.fork();
} else {
  require('http').createServer(function(request, response) {
    switch (request.method) {
      case 'POST':
        request.on('data', function (data) {
          body += data
        });
        request.on('end', function () {
          response.statusCode = 200;
          response.write('<pre>');

          var post = qs.parse(body);
          var canon_url = post["canon_url"].replace(/^.+:\/\//,'git@');
          var absolute_url = post["repository"]["absolute_url"];
          var repository = absolute_url.replace(/\/$/, ".git").replace(/^\//, ":");
          var dynamic_repository_origin = canon_url + repository;
          var dynamic_deploy_key = '/data/deployment/' + post["repository"]["slug"] + '.key';

          if (fs.existsSync('/data/deployment/deploy.key')) {
            ansible = require('child_process').spawn('/usr/local/bin/ansible-playbook', ["/data/deployment/deploy.yml"]);
          } else {
            var playbook = post["repository"]["slug"] + '.yml';
            ansible = require('child_process').spawn('/usr/local/bin/ansible-playbook', ["/data/deployment/" + playbook]);
          }

          ansible.stdout.pipe(response);
          ansible.stdout.on('end', function() {
            response.end('</pre>');
          })
        });
      break;
      case 'GET':
        response.statusCode = 200;
        response.write('<pre>');

        switch(request.url) {
          case '/':
            // if no project specified deploy using all .yml files in /data/deployment
            fs.readdir('/data/deployment', function(err, files) {
              if(err) console.log(err); 
              files.filter(function(item) {
                if(/\.yml/.test(item)) {
                  ansible = require('child_process').spawn('/usr/local/bin/ansible-playbook', ['/data/deployment/' + item]);
                }
              });
            })
            break;
          default:
            ansible = require('child_process').spawn('/usr/local/bin/ansible-playbook', ['/data/deployment' + request.url + '.yml']);
        }
        ansible.stdout.pipe(response);
        ansible.stdout.on('end', function() {
          response.end('</pre>');
        });
      break;
    }
  }).listen(port);
}
