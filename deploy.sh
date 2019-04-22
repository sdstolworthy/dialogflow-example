zip -r ../${PWD##*/}.zip ${PWD} -x "$(pwd)/node_modules/*"
scp ../${PWD##*/}.zip root@utpilot.com:/root/
ssh root@utpilot.com bash << \EOF
kill $(lsof -t -i4:443)
EOF
ssh root@utpilot.com "unzip -o ${PWD##*/}; cd ${PWD##*/} && pwd && source /root/.bashrc && nvm use 10.8.0 && yarn install; PORT=443 yarn start &"
