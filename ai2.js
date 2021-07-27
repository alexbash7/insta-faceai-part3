// Start with env config at first stage
const dotenv = require('dotenv');
dotenv.config();
console.log(process.env);
require('@tensorflow/tfjs-node');
const util = require('util');
const mysql = require('mysql');
const httpsProxyAgent = require('https-proxy-agent');
let agent = new httpsProxyAgent('http://myspambox280:Y7u7TfI@185.252.27.34:65233');
const faceapi = require('face-api.js');
const canvas = require('canvas');
const { Canvas, Image, ImageData, loadImage } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData, loadImage });
const axios = require('axios');
const AWS = require('aws-sdk');
const wasabiEndpoint = new AWS.Endpoint('s3.eu-central-1.wasabisys.com');
const s3 = new AWS.S3({
    endpoint: wasabiEndpoint,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});
let bucketParams = {
    Bucket : process.env.BUCKET_NAME
};

const settings = {};

const DB = {
    tableName: '',
    connection: null,
    userInWork: null,
    imageDataList: []
};

// ===== Start Helper section =====

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const prepareImageLinks = (userId) => {
    const urls = []
    for (let i = 0; i < 12; i++) {
        const urlTemplate = `https://s3.eu-central-1.wasabisys.com/instaloader/${userId}_${i}.jpg`;
        urls.push(urlTemplate);
    }
    console.log(urls);

    return urls;
};

const asyncInterval = async (callback, ms, triesLeft = 5) => {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        if (await callback()) {
          resolve();
          clearInterval(interval);
        } else if (triesLeft <= 1) {
          reject();
          clearInterval(interval);
        }
        triesLeft--;
      }, ms);
    });
};

// ===== End Helper section =====

// ===== Start DB section =====

const openDbConnection = () => {
    const connection = mysql.createConnection({
        host: '185.253.219.150',
        user: 'root',
        password: 'HblVQ$z*6efI',
        database: 'insta'
    });

    connection.connect((err) => {
        if (err) {
          console.error('error connecting: ' + err.stack);
          return;
        }
       
        console.log('connected as id ' + connection.threadId);
    });

    return connection;
};

const closeDbConnection = async (connection) => {
    connection.end((err) => {
        if (err) {
            console.error('error disconnecting: ' + err.stack);
            return;
        }
        DB.connection = null;
        console.log('DB disconnected');
    });
};

const getUser = async (query) => {
    const userTables = process.env.USER_TABLE_LIST.split(',');
    for (let i = 0; i < userTables.length; i++) {
        let tableName = userTables[i];
        let sql = `SELECT user_id FROM ${tableName} WHERE is_ai = 1 AND s3_address = 'instaloader' ORDER BY ID desc LIMIT 1`;
        let row = await query(sql);
        if (row.length > 0) {
            DB.tableName = tableName;
            return row[0].user_id;
        }
    }
};

const updateUser = async (query, userId, tableName) => {
    const sql = `UPDATE ${tableName} SET is_ai = 2 WHERE user_id = ${userId}`;
    await query(sql);
};

const resetUserTest = async (query, userId, tableName) => {
    console.log(`Reset user test data`);
    const sql = `UPDATE ${tableName} SET is_ai = 1 WHERE user_id > ${userId}`;
    await query(sql)
}

// ===== End DB section ======

// ===== Start AI section =====

const initAi = async () => {
    console.log('Start AI initialization...');
    await faceapi.nets.ssdMobilenetv1.loadFromDisk('./ai/weights/')
    await faceapi.nets.ageGenderNet.loadFromDisk('./ai/weights/')
    console.log('End AI initialization');
};

const analyzeImagesWithAI = async (imageUrls) => {
    let zeroDetections = [];
    let femaleDetections = [];
    let unkonwnGenderDetections = [];
    let maleDetections = [];
    let multDetections = [];
    
    for await (const imageUrl of imageUrls) {
        console.log(`Start analyzing of image: ${imageUrl}`);
        let img = null;
        try {
            img = await loadImage(imageUrl);
        } catch (e) {
            console.log(`Cannot load image for analysis`);
            continue;
        }
        const detections = await faceapi.detectAllFaces(img).withAgeAndGender();

        if (detections.length === 1) {
            if (detections[0].gender === 'male') {
                maleDetections.push(imageUrl);
            } else if (detections[0].gender === 'female') {
                femaleDetections.push(imageUrl);
            } else {
                unkonwnGenderDetections.push(imageUrl);
            }
        } else if (detections.length > 1) {
            multDetections.push(imageUrl);
        } else {
            zeroDetections.push(imageUrl);
        }
    }
    
    return femaleDetections
        .concat(maleDetections)
        .concat(unkonwnGenderDetections)
        .concat(multDetections)
        .concat(zeroDetections);
};

// ===== End AI section =====

// ===== AWS section =====

const readImagesFromS3 = async (userId, imageUrls) => {
    for await (const [i, url] of imageUrls.entries()) {
        console.log(`Start reading ${url} from S3`);
        const fileKey = `${userId}_${i}.jpg`;
        try {
            const response = await axios({
                url: url,
                method: 'GET',
                responseType: 'arraybuffer'
            });            
            const imageDataObj = { key: fileKey, body: response.data };
            DB.imageDataList.push(imageDataObj);
        } catch (err) {
            console.log(`File ${fileKey} doesn't exist. Continue execution`);
        }
    }
};

const uploadImagesToS3 = async (imageDataList) => {
    for await (const dataObj of imageDataList) {
        console.log(`Start uploading ${dataObj.key} to S3`);
        const params = {
            Bucket: process.env.BUCKET_NAME,
            Key: dataObj.key,
            Body: dataObj.body
        };
        await s3.upload(params).promise();
    }
};

// ===== End AWS section =====

const run = async () => {
    try {
        if (DB.userInWork !== null) {
            return true;
        }
        console.log('Starting execution');
        DB.connection = openDbConnection();
        const query = util.promisify(DB.connection.query).bind(DB.connection);
        const userId = await getUser(query);
        console.log('UserID: ', userId);
        if (userId === undefined || userId === null) {
            console.log('Stop execution, no users to check');
            closeDbConnection(DB.connection);
            return true;
        }
        DB.userInWork = userId;
        const imageUrlList = prepareImageLinks(userId);
        console.log('Unsorted Image URLs: ', imageUrlList);
        await initAi();
        const imageUrlSortedList = await analyzeImagesWithAI(imageUrlList);
        console.log('Sorted Image URLs: ', imageUrlSortedList);
        await readImagesFromS3(userId, imageUrlSortedList);
        console.log(`Before upload`)
        await uploadImagesToS3(DB.imageDataList);
        console.log(`After upload`);
        await updateUser(query, userId, DB.tableName);
        await closeDbConnection(DB.connection);
        DB.userInWork = null;
        DB.imageDataList = [];
        console.log('Execution complete');
        
        return true; // This will successfully resolve asyncInterval
    } catch (err) {
        console.log(JSON.stringify(err));
        closeDbConnection(DB.connection);
        DB.userInWork = null;
        return false;
    }
}; 

const start = async () => {
    try {
        if (DB.userInWork !== null) {
            console.log(`User with ID ${DB.userInWork} is still processing...`);
            return true;
        }
        await asyncInterval(run, 3000);
    } catch (e) {
        console.log('error handling');
    }
    console.log("Done!");
};

setInterval(start, 5000);
// (async () => {
//     let connection = openDbConnection();
//     const query = util.promisify(connection.query).bind(connection);
//     await resetUserTest(query, 3030, process.env.USER_TABLE_LIST);
//     await closeDbConnection(connection);
//     console.log(`Done`);
// })();
// (async () => {
//  const imageList = [
//     'https://s3.eu-central-1.wasabisys.com/instaloader/1115480170_0.jpg',
//     'https://s3.eu-central-1.wasabisys.com/instaloader/1115480170_7.jpg',
//     'https://s3.eu-central-1.wasabisys.com/instaloader/1115480170_8.jpg',
//     'https://s3.eu-central-1.wasabisys.com/instaloader/1115480170_9.jpg',
//     'https://s3.eu-central-1.wasabisys.com/instaloader/1115480170_10.jpg',
//     'https://s3.eu-central-1.wasabisys.com/instaloader/1115480170_11.jpg',
//     'https://s3.eu-central-1.wasabisys.com/instaloader/1115480170_5.jpg',
//     'https://s3.eu-central-1.wasabisys.com/instaloader/1115480170_1.jpg',
//     'https://s3.eu-central-1.wasabisys.com/instaloader/1115480170_3.jpg',
//     'https://s3.eu-central-1.wasabisys.com/instaloader/1115480170_2.jpg',
//     'https://s3.eu-central-1.wasabisys.com/instaloader/1115480170_4.jpg',
//     'https://s3.eu-central-1.wasabisys.com/instaloader/1115480170_6.jpg'
//   ];
//   await readImagesFromS3(1115480170, imageList);
//   console.log(`===read=====`);
//   await sleep(5000);
//   DB.imageDataList.forEach((v) => {
//       console.log(`Key: ${v.key} and ${v.body.length}`);
//   })
// })()