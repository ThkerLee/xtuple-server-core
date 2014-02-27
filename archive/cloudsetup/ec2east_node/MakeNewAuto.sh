#!/bin/bash
# sh ./MakeNew.sh customer/clustername databasename

# What this does:
# Setups up configs and entries for:
# Nginx, xTuple Mobile, Upstart, and PGBouncer, all from one command.

# Todo: Check monitor.xtuple.com database for port overlap - possibly read that db and assign something not taken. :)
# Trigger on Ports column? Autoincrement? That'd be nice.

if [ -z "$NODEREDIRECTPORT" ]; then

HIGHHTTP=`grep 'server 127.0.0.1:100'  /etc/nginx/sites-available/* | cut -d':' -f 3 | cut -d ';' -f 1 | sort -r |head -1`
NEWHTTP=`expr $HIGHHTTP + 1`

HIGHHTTPS=`grep 'server 127.0.0.1:104'  /etc/nginx/sites-available/* | cut -d':' -f 3 | cut -d ';' -f 1 | sort -r |head -1`
NEWHTTPS=`expr $HIGHHTTPS + 1`

echo "New HTTP = $NEWHTTP , New HTTPS = $NEWHTTPS"
export NODEREDIRECTPORT=$NEWHTTP
export NODEPORT=$NEWHTTPS

fi

export CUSTOMER=$1


# Port 10080
# portssl 10443
export DBNAME=$2
export DBUSER=node
export DBPASS='SOMEPASSWORD'

# Port 10023 10.0.1.125
# Port 10024 10.0.1.239
WORKDATE=`/bin/date "+%m%d%Y"`

export XTHOME=/etc/xtuple/
export XTCODE=/usr/local/xtuple/xtuple
export BOUNCERINI=/etc/pgbouncer/pgbouncer.ini
export LOG="${CUSTOMER}_${WORKDATE}.log"

checkconfigdir()
{
if [ ! -d "${XTHOME}/${CUSTOMER}" ];
then
echo "Creating Directory with mkdir -p ${XTHOME}/${CUSTOMER}"
mkdir -p ${XTHOME}/${CUSTOMER}
echo "Copying $XTCODE/node-datasource/lib to ${XTHOME}/${CUSTOMER}"
cp -R ${XTHOME}/lib_template ${XTHOME}/${CUSTOMER}/lib
echo "done"
else
echo "Path ${XTHOME}/${CUSTOMER} already Exists!"
fi
}

writeconfigjs()
{
if [ ! -f "${XTHOME}/${CUSTOMER}/${CUSTOMER}.js" ];
then
cat << EOF >> ${XTHOME}/${CUSTOMER}/${CUSTOMER}.js
/*jshint node:true, indent:2, curly:false, eqeqeq:true, immed:true, latedef:true, newcap:true, noarg:true,
regexp:true, undef:true, strict:true, trailing:true, white:true */
/*global */

(function () {
  "use strict";

  module.exports = {
    processName: "node-datasource",
    allowMultipleInstances: true,
    datasource: {
      debugging: false,
      debugDatabase: false,
      enhancedAuthKey: "j3H44uadEI#8#kSmkh#H%JSLAKDOHImklhdfsn3#432?%^kjasdjla3uy989apa3uipoweurw-03235##+=-lhkhdNOHA?%@mxncvbwoiwerNKLJHwe278NH28shNeGc",
      sessionTimeout: 60,
      requireCache: true,
      pgPoolSize: 1,
      pgWorker: false,
      bindAddress: "localhost",
      redirectPort: ${NODEREDIRECTPORT},
      maintenancePort: 10442,
      proxyPort: 443,
      port: ${NODEPORT},
      keyFile: "/etc/xtuple/lib/private/mobile.xtuple.com.key.stripped",

      certFile: "/etc/xtuple/lib/private/mobile.xtuple.com.crt",
      caFile: [
        "/etc/xtuple/lib/private/SSL123_PrimaryCA.pem",
        "/etc/xtuple/lib/private/SSL123_SecondaryCA.pem"
      ],
      saltFile: "/etc/xtuple/lib/private/salt.txt",
      biKeyFile: "",
      xTupleDbDir: "/usr/local/xtuple/databases",
      psqlPath: "psql",
      nodePath: "node",

      // These fields need to be filled in for the datasource
      // to be able to email
      smtpHost: "mercury.xtuple.com",
      smtpPort: 587,
      smtpUser: "_smtp_user_",
      smtpPassword: "_smtp_password_",

      // URL of BI server
      // Leave this empty unless reports are installed
      biUrl: "", // "http://yourserver.com:8080/pentaho/content/reporting/reportviewer/report.html?",
      biServerUrl: "", // "http://yourserver.com:8080/pentaho/"

      // these properties are dynamically registered with the
      // node discovery service

      // the unique identifer registered for this service/instance
      name: "dev-datasource",

      // human-friendly description of this service
      description: "NA",

      // REQUIRED - the ip address or hostname for this instance
      hostname: "localhost",

      // human-friendly location identifier for various cloud, physical
      // servers, etc.
      location: "NA",
      // Add each database to the array.
      databases: ["${DBNAME}"],
      testDatabase: "" // this must remain empty for production datasources
    },
    extensionRoutes: [],
    databaseServer: {
      hostname: "localhost",
      port: 6432,
      user: "${USER}",
      password: "${PASS}"
    }
  };
}());
EOF

else
echo "Config.js named ${CUSTOMER}.js already exists! Skipping."

fi
}

writenodeservice()
{
cat << EOF >> /etc/init/${CUSTOMER}_mobile.conf
# xTuple
#
# The xTuple-node process allows mobile connections

description     "xTuple Node Server for ${CUSTOMER}"

start on filesystem or runlevel [2345]
stop on runlevel [!2345]

console output

respawn

chdir /usr/local/current/xtuple/node-datasource
exec ./main.js -c /etc/xtuple/${CUSTOMER}/${CUSTOMER}.js > /var/log/${CUSTOMER}_mobile.log
EOF
}

chknodeservice()
{
if [ ! -f /etc/init/${CUSTOMER}_mobile.conf ];
then
echo "${CUSTOMER}_mobile.conf does not exist. Creating."
writenodeservice
else
echo "${CUSTOMER}_mobile.conf already exists. Skipping."
fi
}



chkbouncer()
{
CHKBOUNCERINI=`grep ${DBNAME} ${BOUNCERINI}`
if [ "$CHKBOUNCERINI" ];
then
echo "${DBNAME} exists in ${BOUNCERINI} as:"
echo "${CHKBOUNCERINI}"
else
echo "${DBNAME} not found in ${BOUNCERINI}. We can write it in there, Yes? or No? (Y/N)"
read WRITELINE

case $WRITELINE in
Y)
cat << EOF >> ${BOUNCERINI}
${DBNAME} = host=${BOUNCEIP} port=${FINDPORT} dbname=${DBNAME} password=${PASS} user=${USER} pool_size=3
EOF
;;
N)
echo "Try again or X to cancel"
chkbouncer
;;

X)
echo "Quitting"
exit 0;
;;
esac
fi
}

writepgbouncer()
{
echo "What pg server should this bounce to?"
echo "Select one of the Options:"
echo "A) 10.0.1.125 (10023)"
echo "B) 10.0.1.239 (10024)"

echo "Enter 'A' or 'B'"
read BOUNCEIP
case $BOUNCEIP in
"A")
BOUNCEIP=10.0.1.125
SSHPORT=10023
OTHER="10.0.1.239"
;;
"B")
BOUNCEIP=10.0.1.239
SSHPORT=10024
OTHER="10.0.1.125"
;;
*)
echo "Invalid - Try again."
writepgbouncer
;;
esac
echo "Let's try to find their PG Port"
FINDCLUSTER=`ssh -i /etc/xtuple/Scripts/ec2-keypair.pem ubuntu@${BOUNCEIP} pg_lsclusters -h | grep $CUSTOMER`

if [ "$FINDCLUSTER" ];
then
FINDPORT=`ssh -i /etc/xtuple/Scripts/ec2-keypair.pem ubuntu@${BOUNCEIP} pg_lsclusters -h | grep $CUSTOMER | tr -s " " | cut -d ' ' -f 3`
echo "Found $CUSTOMER db cluster on $BOUNCEIP on ${FINDPORT}"
echo "searching pgbouncer.ini for a similar entry"
chkbouncer
else
echo "Database for $CUSTOMER doesn't exist on $BOUNCEIP. Try $OTHER"
# BOUNCEIP=${OTHER}
# FINDPORT=`ssh -i /etc/xtuple/ec2-keypair.pem ubuntu@${BOUNCEIP} pg_lsclusters -h | grep $CUSTOMER | tr -s " " | cut -d ' ' -f 3`
writepgbouncer
fi
}

echo "You Entered: $1, $2"
echo "This look OK? (Y/N)"
read HUH
case $HUH in
Y)

./nodeconfig.sh
#writenodeservice
./nginxconfig.sh 
#chknodeservice
# writepgbouncer

echo "wrote all configs"
;;
N)
echo "quitting"
;;
esac

exit 0;
