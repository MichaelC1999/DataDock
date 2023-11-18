FROM node:18

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY dataAccess/helpers.js ./
COPY dataAccess/poolAnalysis.js ./
COPY dataAccess/userAnalysis.js ./
COPY dataAccess/poolMonitor.js ./
COPY dataAccess/transferMonitor.js ./

CMD ["node", "./$file", "$arg0", "$arg1", "$arg2", "$arg3", "$arg4", "$arg5", "$arg6", "$arg7", "$arg8"]