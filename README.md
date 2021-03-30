# TO SETUP YOUR DEV ENVIRONMENT

## On Mac, agree to XCode
```bash
sudo xcodebuild -license
```

## Install Tools
You'll need NodeJS v12+, npm, git, nodemon (global install), an editor like Sublime 3.2.1+
You can use brew for most of these.

## Git Credentials
On Mac, type Cmd-Space and find Keychain Access
Within Keychain search for "github"
Set the URL to https://github.com and the username and password appropriately

## Clone the repos
```bash
cd ~/code
git clone https://github.com/wdemarest/strogsvr
git clone https://github.com/wdemarest/candyhop
git clone https://github.com/wdemarest/reactorRescue
git clone https://github.com/wdemarest/shadowStone
git clone https://github.com/wdemarest/turmoil
```

## Secret Encryption
This makes it so that a Sublime plugin will auto-encrypt any changes you make to .secret.hjson files
```bash
npm install -g node-cipher
cd ~/code/strogsvr
tools/util.sh install
```

## Setup your environment variables
Edit your \~/.profile and make sure it contains
```bash
export STROG_CONFIG_ID=your_config_name_for_example_bob
export STROG_PASSPHRASE=passphrase_kept_in_my_pwd_file
```

## Setup your strogsvr/config.<STROG_CONFIG_ID>.secret.hjson file based on config.template.hjson
Ken has all the details in his password file under strogsvr. These files are excluded from
version control, but when you change them a Sublime plugin will save them as encrypted .cast5 files

Just in case that doesn't work, here are the methods to encrypt and decrypt them.
Encrypt:
nodecipher encrypt "config.production.secret.hjson" "config.production.cast5" <<< "$STROG_PASSPHRASE"

Decrypt:
nodecipher decrypt "config.production.cast5" "config.production.secret.hjson" <<< "$STROG_PASSPHRASE"

## Sublime Config
Click Sublime / Preferences / Settings, and set all of the following:
```json
{
	"auto_complete": false,
	"auto_match_enabled": false,
	"tab_completion": false,
	"word_wrap": "false"
}

```

Install Sublime Hooks and Hjson highlighting:
1. Install "Package Control" in Sublime: https://packagecontrol.io/installation
2. Paste that text into Sublime console: Ctrl+Backtick then paste
3. Restart Sublime.
4. Sublime/Preferences/Package Control; type "Package Install" and choose Hjson
5. Sublime/Preferences/Package Control; type "Package Install" and choose OnSave

## Mac HID setup
```bash
defaults write -g InitialKeyRepeat -int 10
defaults write -g KeyRepeat -int 1
defaults write -g com.apple.keyboard.fnState -int 1
Then logout & login to make the changes take effect
```
If you use a roller mouse:
* Uninstall any Logitech Control Center (LCC)
* Install SteerMouse
* In SteerMouse, set Wheel / Roll Up to "Scroll Up 5.0"
* In SteerMouse, set Wheel / Roll Down to "Scroll Down 5.0"

# TO SETUP A NEW SERVER

1. If you need to generate a keypair (typically you'll let AWS do this for you)
```bash
openssl genrsa -des3 -out strog.pem 2048
openssl rsa -in strog.pem -outform PEM -pubout -out strog.pub
chmod 400 ~/.ssh/strog.pub
chmod 400 ~/.ssh/strog.pem
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
Save it as ~/.ssh/strog.pem
chmod 400 ~/.ssh/strog.pem
```

2.1 Be sure that Route53 has strog.com set up properly to point at the IP address of this server.

3. Setup the .pem file
From local osx terminal:
```bash
cd ~/.ssh
pico strog.pem
copy/paste the private key you used to boot the AWS machine into that file
ctrl-x  y  <enter>
```

4. Secure shell to the remote
This assumes you have strog.com setup in Route 53 to point to the booted IP address.
```bash
ssh ubuntu@strog.com -i ~/.ssh/strog.pem
```

5. Install NodeJs and Git on the remote
```bash
sudo apt-get update
sudo apt-get install git
sudo apt-get install nodejs
sudo apt-get install npm
sudo npm install -g supervisor
```

5.5 Install Redis on the remote
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
git clone https://github.com/wdemarest/turmoil
```

6.1 Cache passwords for each
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

6.2 Install node packages in each
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
Note that as of 2019-10-18 these commands are always run during a ./svr start
```bash
sudo sysctl net.ipv4.ip_forward=1
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8080
```

8. Setup the passphrase on the remote
Edit \~/.profile and make sure it contains
```bash
export STROG_PASSPHRASE=passphrase_kept_in_my_pwd_file
```

9. Edit the remote \~/.ssh/known_hosts file and paste appropriate public keys

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

* deploy   [strogsrv|candyhop|reactorRescue|shadowStone]  - deploys to and overwrites server
* config   [strogsrv|shadowStone]  - copies config.production.secret.hjson to server
* log      [strogsvr|shadowStone]  - emits the last 100 log entries from the server
* logcache [strogsvr|shadowStone]  - copies the remote log file to ./logcache, overwriting
* start    - starts the servers
* restart  - re-starts the servers
* stop     - stops the servers
* status   - shows the status of the running servers
* update   - updates the Ubuntu OS with security and other patches
* login    - shell to the server
* fetch    - fetch server-only files into the ./archive directory, as backups
* dev      - starts strogsvr on your dev machine

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
