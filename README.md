# TO SETUP YOUR DEV ENVIRONMENT

You'll need NodeJS v12, npm, git, nodemon (global install), an editor like Sublime 3

Sublime Hjson highlighting is a plus:
1. Install "Package Control" in Sublime: https://packagecontrol.io/installation
2. Paste that text into Sublime console: Ctrl+Backtick then paste
3. Restart Sublime. Then Sublime/Preferences/Package Control; type "Package Install" and choose Hjson




# TO SETUP A NEW SERVER

1. If you need to generate a keypair (typically you'll let AWS do this for you)
```bash
openssl genrsa -des3 -out jeesty.pem 2048
openssl rsa -in jeesty.pem -outform PEM -pubout -out jeesty.pub
chmod 400 ~/.ssh/jeesty.pub
chmod 400 ~/.ssh/jeesty.pem
```

2. Boot a fresh Ubuntu instance at EC2
```
Visit aws.amazon.com, login and access EC2
Click [Launch]
Pick "Ubuntu Server 16.04 LTS (HVM), SSD Volume Type"
Pick "t2.micro - free tier eligible"
Change Security to allow "outbound all" and "inbound port 22" and "inbound port 80"
Accept all other defaults for storage, etc.
Pick [Launch], and create a new keypair
Save it as ~/.ssh/jeesty.pem
chmod 400 ~/.ssh/jeesty.pem
```

3. Setup the .pem file
From local osx terminal:
```bash
cd ~/.ssh
pico strog.pem
copy/paste the private key you used to boot the AWS machine into that file
ctrl-x  y  <enter>
```

4. Secure shell to the remote
```bash
ssh -i ~/.ssh/jeesty.pem ubuntu@54.152.44.153
```

5. Install NodeJs and Git
```bash
sudo apt-get update
sudo apt-get install git
sudo apt-get install nodejs
sudo apt-get install npm
sudo npm install -g supervisor
```

5.5 Install Redis
```bash
sudo apt-get install redis-server
sudo systemctl enable redis-server.service
sudo vim /etc/redis/redis.conf
Consider these values: maxmemory 256mb
Consider these values: maxmemory-policy allkeys-lru
sudo systemctl restart redis-server.service
```

6. Clone all repos
```bash
cd ~
git clone https://github.com/wdemarest/strogsvr
git clone https://github.com/wdemarest/candyhop
git clone https://github.com/wdemarest/reactorRescue
git clone https://github.com/wdemarest/shadowStone
```

6.2 Cache passwords for each
```bash
cd ~/strogsvr
git config credential.helper store ; git pull
cd ~/candyhop
git config credential.helper store ; git pull
cs ~/reactorRescue
git config credential.helper store ; git pull
cs ~/shadowStone
git config credential.helper store ; git pull
```

6.5 Install packages in each
```bash
cd ~/strogsvr
npm install
cd ~/candyhop
npm install
cs ~/reactorRescue
npm install
cs ~/shadowStone
npm install
```

7. Redirect port 8080 to port 80. We don't want to run the server as root, but ports below 1024 are root only, so this is the safe workaround.
```bash
sudo sysctl net.ipv4.ip_forward=1
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8080
```

8. Setup your ~/strogsvr/config.json file based on config-template.json
Ken has all the details in his password file under strogsvr

9. Edit the remote ./ssh/known_hosts file and paste appropriate public keys

10. Get a Mandrill account
   - verify the email address
   - add a DKIM record in route 53
- setup postfix on the server:
   http://www.techknowjoe.com/article/create-your-own-email-forwarding-server

11. Test the server is working on the remote
```
nodejs ./server.js
```
then launch your browser and visit the appropriate IP address on port 80.

# Running the Server

While logged in to the koding.com server, or any machine that has its public key on
the strog.com server, run:

    ./svr [ deploy app | stop | start | restart | status | log | login | fetch | dev ]
    deploy app can be strogsvr, candyhop, reactorRescue, shadowStone

* deploy - forces the strog.com machine to conform to the git master
* stop - stops the server
* start - starts the server
* restart - shuts down any running server and starts it up fresh, with auto-restarting
* status - tells the server status
* log - shows the server's log file
* login - connects you to the server shell
* fetch - copies all important server files to local archive
* dev - launches the server on your dev machine

# Server Maintenance
From time to time you must make sure that Ubuntu has all needed packages updated for security.
From /strogsvr run:
```
sudo apt-get update
sudo apt-get upgrade
sudo apt-get install curl python-software-properties
curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
sudo apt-get install -y nodejs
```

# To sign players up

1. Visit http://strog.com
2. Login with the username "admin" and the admin password
3. http://strog.com/signup.html

# Public Key

For reference, here is the public key to connect using strog.pem:
```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCdzhJlKt5CPCB0oX5Jt8ctjgr2Scdw0ARKb4c6hW3rqHzGU8K7q+W4ulVIGJzrCB5o1lVvcfzEPu37rdon1VngZMHAhEtf5SyNxIbOBqXrCpge2UvMUDW8fxOez1O+pVotx4IYoC1jzwfJEWD6LFmGUuKVxTxbkUCNmPiosECGBMEHvrsOWsFL9vUXhp/WrnMPP/KGCMN6Wm0W1kxlv8ISp6tQ8Zi3u4by0C+5FSKW7Ta5Z9EzdxKRMVyPw0Kw3Y9QiLYEoSkM5B3UcXtK+eCL2AR8nE/ul/kRdG/QfDrW3Bf+QDX5MClCVXtk0qIn7q/U65kr4embszEwOBzB8BAB strog
```
