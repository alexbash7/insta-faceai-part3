require('@tensorflow/tfjs-node');
const dotenv = require('dotenv');
dotenv.config();
// require('@tensorflow/tfjs-node-gpu');
// implements nodejs wrappers for HTMLCanvasElement, HTMLImageElement, ImageData
// const tf = require('@tensorflow/tfjs-node')
// test
// const faceapi = require('@vladmandic/face-api');
var canvas = require('canvas');
var faceapi = require('face-api.js');
var path = require('path');
var fetch = require('node-fetch');
var mysql = require('mysql');
var dayjs = require('dayjs');
const isImageUrl = require('is-image-url');
const delay = require('delay')
const moment = require('moment');
let httpsProxyAgent = require('https-proxy-agent');
const axios = require('axios');
var random_useragent = require('random-useragent');
const { doesNotMatch } = require('assert');
// const log = require('simple-node-logger').createSimpleFileLogger('logs/ai.log');

// var agent = new httpsProxyAgent('http://myspambox280:Y7u7TfI@176.107.178.248:65233');
var agent = new httpsProxyAgent('http://myspambox280:Y7u7TfI@185.252.27.34:65233');
// var agent = new httpsProxyAgent('http://alexwhte:alexwhte@connect4.mproxy.top:10813');
// var agent = new httpsProxyAgent('http://pr24hgxWx1jv:RlaRjczpSwTI@77.121.201.10:9033');

let ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 12_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 105.0.0.11.118 (iPhone11,8; iOS 12_3_1; en_US; en-US; scale=2.00; 828x1792; 165586599)'

var config = {
  httpsAgent: agent,
  headers: {
    'User-Agent': ua,
    // 'Cookie': sessionid,
  },
  timeout: 5000,
}

var connection = mysql.createConnection({
  host: '185.253.219.150',
  user: 'root',
  password: 'HblVQ$z*6efI',
  database: 'insta'
});
connection.connect();


const db = [];
let totalAdd = 0;
let all = 0;
let td = 0
let ta = 0
let settings = {};
let accountTables = '';

const getSettings = () => {
  connection.query(`
  SELECT
      *
  FROM settings
  WHERE app_name = 'insta-face-ai'
  `,
    function (error, results) {
      console.log('Got settings.', dayjs().format('YYYY-MM-DD mm:ss'))
      for (var i = 0; i < results.length; i++) {
        if (results[i].key === 'proxy') {
          settings.proxy = results[i].value;
          agent = new httpsProxyAgent(settings.proxy);
          // console.log(results[i].value)
        } else if (results[i].key === 'id_tables') {
          settings.id_tables = results[i].value;
          // console.log(results[i].value)
        } else if (results[i].key === 'target_table') {
          settings.target_table = results[i].value;
          // console.log(results[i].value)
        }
      }
    }
  );

}

getSettings();

setInterval(function () {
  getSettings();
}, 10000);


const { Canvas, Image, ImageData, loadImage } = canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData, loadImage })


const dailyTimer = () => {

  setInterval(() => {
    if (moment().format('mm') == '29') {
      // log.info(' Total All/Add/%: '+`${all}/${ta}/${Math.round(ta/all*100)}%`)
      // all = 0;
      // totalAdd = 0

    }
  }, 60000)
}

const Start = async () => {
  // await getAllLocation();
  // await Login();
  dailyTimer()
  await initAi()
  await getAllLocation()

  await setInterval(async () => { await getAllImages() }, 5000)




}

// const getImageAi = async (id,location,url) => {
//   // await delay(1000)
//   // console.log(url)
//   try {
//     const img = await canvas.loadImage(url);
//   // const image = await faceapi.fetchImage('https://homepages.cae.wisc.edu/~ece533/images/girl.png')
//   const detections = await faceapi.detectAllFaces(img).withAgeAndGender()
//   let isMale = false;
//   // console.log(detections.length)

//   if (detections.length > 0 ) {

//     detections.map(item => {
//       if (item.gender == 'male') {
//         isMale = true
//       }
//     })

//   }

//   if (detections.length > 0 && isMale == false ) {
//     if (!db.includes(parseInt(id))) {
//       // console.log(id)
//       // console.log(db)
//       // console.log(db.includes(id))
//       db.push(parseInt(id));
//       // console.log(db.slice(db.length-101,db.length-1))
//       connection.query(`INSERT INTO accounts (user_id, location_id) VALUES ('${id}','${location}')`, function (error, results, fields) {
//         if (error) throw error;
//         // console.log('inserted '+id)
//       });
//       // console.log('Added '+url)

//       return 2
//     }
//   }
//   return 1
// } catch {
//   // console.log('Cant load image')
//   return 0
// }

// }

const getImageAi = async (id, location, url) => {
  let retVal;
  let source
  ua = random_useragent.getRandom();
  try {
    const img = await loadImage(url);

    detections = await faceapi.detectAllFaces(img).withAgeAndGender()

    let isMale = false;

    if (detections.length > 0) {
      td++
      retVal = 3

      detections.map(item => {
        if (item.gender == 'male') {
          isMale = true
        }
      })

    }

    if (detections.length > 0 && isMale == false) {
      if (!db.includes(parseInt(id))) {
        // console.log(id)
        // console.log(db)
        // console.log(db.includes(id))
        db.push(parseInt(id));
        // // console.log(db.slice(db.length-101,db.length-1))
        // console.log(user_id,location)
        connection.query(`INSERT INTO ${settings.target_table} (user_id, location_id) VALUES ('${id}','${location}')`, function (error, results, fields) {
          if (error) {
            console.log(error.message)

            // log.error(error.message)
          }
          ta++
          // console.log('inserted '+id)
        });
        // console.log('Added '+url)

        retVal = 2
      }
    }

    return retVal
  } catch (err) {
    console.log(err.message)
    console.log(id, url)
    // log.error(err.message, id, url)
  }

  retVal = 0
  return retVal;
}

const initAi = async () => {
  await faceapi.nets.ssdMobilenetv1.loadFromDisk('./ai/weights/')
  await faceapi.nets.ageGenderNet.loadFromDisk('./ai/weights/')
}

const getAllImages = async () => {
  console.log('Start new cycle')
  let totalErr = 0;
  let totalAdded = 0;
  let totalDet = 0;
  let total = 0;
  let ids = []
  let newR = []

  connection.query(`SELECT * FROM posts order by id desc limit 10`, function (error, results, fields) {
    if (error) {
      console.log(error.message)
      // log.error(error.message)
    }

    // console.log('Got '+results.length+' images')
    // console.log('Got '+results.length)
    let q3;
    if (results.length > 0) {
      results.map((itm) => { ids.push(itm.post_url) })
      q3 = ` where post_url in ('${ids.join("','")}')`
      newR = [...results]
      // console.log(q3)
      connection.query(`DELETE FROM posts ${q3}`, function (error, results, fields) {
        if (error) {
          console.log(error.message)
          // log.info(error.message)
        }

        if (newR.length > 0) {
          total = newR.length;
          Promise.all(
            newR.map(async (itm) => {
              // console.log(itm.user_id, itm.Location_id, itm.img_url)

              // console.log(db.includes(parseInt(itm.user_id)))
              // console.log(itm.user_id)
              // console.log(db.length)
              let ii = 1;
              if (!db.includes(parseInt(itm.user_id))) {
                // console.log('ai '+itm.user_id)
                ii = await getImageAi(itm.user_id, itm.location_id, itm.img_url)
                // console.log(ii)
              }

              // console.log(ii)
              if (ii == 0) {
                totalErr++;
                //  console.log('Error found. Wait 10 min.')
                //  log.error('Error found. Wait 10 min.')
                //  await delay(600000)
              } else if (ii == 2) {
                totalAdded++;
                totalDet++
              } else if (ii == 3) {
                totalDet++;
              }

            })
          ).then((values) => {
            // Detete records

            totalAdd += totalAdded;
            all += total;

            console.log('Batch: ' + total + ' Added: ' + totalAdded + ` Detected: ${totalDet}` + ' Errors: ' + totalErr + ' Time: ' + moment().format('YYYY-MM-DD HH:mm:ss') + ' Total All/Add/%: ' + `${all}/${ta}/${Math.round(ta / all * 100)}%`);
            if (totalDet == 0) {
              // log.info('Detected: 0')
            }
          });


        } else if (results.length == 0) {
          console.log('No records in DB. Time: ' + moment().format('YYYY-MM-DD HH:mm:ss'));
        }

      });

    } else {
      console.log('No records in DB. Time: ' + moment().format('YYYY-MM-DD HH:mm:ss'))
    }


  });







}


const getAllLocation = async () => {

  // connection.query(`SELECT user_id FROM ${settings.target_table} order by id desc`, function (error, results, fields) {
  //   if (error) throw error;
  //   // console.log(results);
  //   results.map(async (item) => {

  //     db.push(parseInt(item.user_id));

  //   });

  //   console.log('DB length: '+db.length);


  // });
  const accountTables = settings.id_tables.split(',');


  accountTables.forEach(async (table) => {
    await connection.query(`SELECT user_id FROM ${table} order by id desc`, function (error, results, fields) {
      if (error) throw error;
      results.map(async (item) => {
        await db.push(parseInt(item.user_id));
      });
      console.log('Accounts DB length: ' + db.length);
    });
  })


}



Start();
