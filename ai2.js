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
    userInWork: null
};

// ===== Start Helper section =====

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
    console.log('No users to check');
};

const updateUser = async (query, userId, tableName) => {
    let sql = `UPDATE ${tableName} SET is_ai = 2 WHERE user_id = ${userId}`;
    await query(sql);
};

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
    try {
        for (let i = 0; i < imageUrls.length; i++) {
            console.log(`Start analyzing of image: ${imageUrls[i]}`);
            const img = await loadImage(imageUrls[i]);
            const detections = await faceapi.detectAllFaces(img).withAgeAndGender();

            if (detections.length === 1) {
               if (detections[0].gender === 'male') {
                   maleDetections.push(imageUrls[i]);
               } else if (detections[0].gender === 'female') {
                   femaleDetections.push(imageUrls[i]);
               } else {
                   unkonwnGenderDetections.push(imageUrls[i]);
               }
            } else if (detections.length > 1) {
                multDetections.push(imageUrls[i]);
            } else {
                zeroDetections.push(imageUrls[i]);
            }
        }
        
        return femaleDetections
        .concat(maleDetections)
        .concat(unkonwnGenderDetections)
        .concat(multDetections)
        .concat(zeroDetections);
    } catch (error) {
        console.log(imageUrl);
        console.log(JSON.stringify(error));
    }
};

// ===== End AI section =====

// ===== AWS section =====

const readImagesFromS3 = async (userId, imageUrls) => {
    const imageDataList = [];
    imageUrls.forEach(async (imageUrl, i) => {
        console.log(`Start reading ${imageUrl} to S3`);
        const response = await axios({
            url: imageUrl,
            method: 'GET',
            responseType: 'arraybuffer'
        });
        const fileKey = `${userId}_${i}.jpg`;
        imageDataList.push({ key: fileKey, body: response.data });
    });

    return imageDataList;
};

const uploadImagesToS3 = async (imageDataList) => {
    imageDataList.forEach(async (dataObj) => {
        console.log(`Start uploading ${imageUrl} to S3`);
        var params = {
            Bucket: process.env.BUCKET_NAME,
            Key: dataObj.key,
            Body: dataObj.body
        };
        await s3.upload(params).promise();
    });
};

// ===== End AWS section =====

const run = async () => {
    try {
        console.log('Starting execution');
        let connection = openDbConnection();
        const query = util.promisify(connection.query).bind(connection);
        const userId = await getUser(query);
        console.log('UserID: ', userId);
        if (DB.userInWork !== null) {
            console.log(`User with ID ${userId} is still processing...`);
            return true;
        }
        if (userId === undefined || userId === null) {
            console.log('Stop execution, no users to check');
            return true;
        }
        DB.userInWork = userId;
        const imageUrlList = prepareImageLinks(userId);
        console.log('Unsorted Image URLs: ', imageUrlList);
        await initAi();
        const imageUrlSortedList = await analyzeImagesWithAI(imageUrlList);
        console.log('Sorted Image URLs: ', imageUrlSortedList);
        const imagesDataList = await readImagesFromS3(userId, imageUrlSortedList);
        await uploadImagesToS3(imagesDataList);
        await updateUser(query, userId, DB.tableName);
        closeDbConnection(connection);
        DB.userInWork = null;
        console.log('Execution complete');
        
        return true; // This will successfully resolve asyncInterval
    } catch (err) {
        console.log(JSON.stringify(err));
        return false;
    }
}; 

const start = async () => {
    try {
        await asyncInterval(run, 3000);
    } catch (e) {
        console.log('error handling');
    }
    console.log("Done!");
};

start();
