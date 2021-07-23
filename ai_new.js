// Start with env config at first stage
const dotenv = require('dotenv');
dotenv.config();
console.log(process.env);
const util = require('util');
const mysql = require('mysql');
const dayjs = require('dayjs');
const httpsProxyAgent = require('https-proxy-agent');
// const tf = require('@tensorflow/tfjs-node');
const faceapi = require('face-api.js');
const canvas = require('canvas');
const { Canvas, Image, ImageData, loadImage } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData, loadImage });
const settings = {};

const DB = {
    imageLinks: {},
};

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

const getAllFromSettingsTable = async (query) => {
    const sql = `
        SELECT
            *
        FROM settings
        WHERE app_name = 'insta-face-ai'
    `;
    const rows = await query(sql);
    console.log('Got settings.', dayjs().format('YYYY-MM-DD mm:ss'))
    rows.forEach((row) => {
        if (row.key === 'proxy') {
            settings.proxy = row.value;
            agent = new httpsProxyAgent(settings.proxy);
        } else if (row.key === 'id_tables') {
            settings.id_tables = row.value;
        } else if (row.key === 'target_table') {
            settings.target_table = row.value
        } else {
            console.log('Unknown setting: ', JSON.stringify(row));
        }
    });
};

const getUsersFromAllLocations = async (query) => {
    const selectFromTargetTableSQL = `SELECT user_id FROM ${settings.target_table} order by id desc`;
    let rows = await query(selectFromTargetTableSQL);
    DB.users = rows.map((row) => row.user_id);

    const accountTables = settings.id_tables.split(',');
    accountTables.forEach(async (table) => {
        rows = await query(`SELECT user_id FROM ${table} order by id desc`);
        DB.users = DB.users.concat(rows.map((row) => row.user_id));
    });
};

const getImageAi = async (userId, imageUrls) => {
    let zeroDetections = [];
    let oneDetection = [];
    let multDetections = [];
    try {
        const img = await loadImage(url);
        const detections = await faceapi.detectAllFaces(img).withAgeAndGender();

        // Rules
        // 1) Is 1 person on image
        if (detections.length === 1) {
            oneDetection.push(imageUrl);
        } else if (detections.length > 1) {
            multDetections.push(imageUrl);
        } else {
            zeroDetections.push(imageUrl);
        }
        return oneDetection.concat(multDetections).concat(zeroDetections);
    } catch (error) {
        console.log(imageUrl);
        console.log(JSON.stringify(error));
    }
};

const getAllImagesLinks = async () => {
    const generateLinks = (userId) => {
        const baseUrl = process.env.BASE_URL;
        let links = [];
        for (let i = 0; i < 12; i++) {
            let url = `${baseUrl}${userId}&count=${i}`;
            links.push(url);
        }
        return links;
    };
    
    DB.users.forEach((user) => {
        let links = generateLinks(user) 
        DB.imageLinks[user] = links;
        DB.imageLinksOrdered[user] = getImageAi(user, links);
    });
}

// ===== End DB section ======

// ===== Start AI section =====

const initAi = async () => {
    console.log('Start AI initialization...');
    await faceapi.nets.ssdMobilenetv1.loadFromDisk('./ai/weights/')
    await faceapi.nets.ageGenderNet.loadFromDisk('./ai/weights/')
    console.log('End AI initialization');
}

// ===== End AI section =====

const start = async () => {
    console.log('Starting execution');
    let connection = openDbConnection();
    const query = util.promisify(connection.query).bind(connection);
    await getAllFromSettingsTable(query);
    await initAi();
    await getUsersFromAllLocations(query);
    // await getAllImagesLinks();
    closeDbConnection(connection);
    console.log('Execution complete');
}; 

(async () => {
    await start();
})();