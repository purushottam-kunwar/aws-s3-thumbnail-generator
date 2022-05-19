
// Create a client to read objects from S3
const AWS = require('aws-sdk');

const s3 = new AWS.S3();

// Libraries for image resize.
const sharp = require('sharp');
const stream = require('stream');

const width = 500;
const prefix = `${width}w`;

// Function to create a read stream to an S3 object.
function readStreamFromS3({ Bucket, Key }) {
  return s3.getObject({ Bucket, Key }).createReadStream();
}

// Function to create a write stream to S3.
function writeStreamToS3({ Bucket, Key }) {
  const pass = new stream.PassThrough();
  return {
    writeStream: pass,
    uploadFinished: s3
      .upload({
        Body: pass,
        Bucket,
        Key
      })
      .promise()
  };
}

// Get size from stream (sharp)
function getSizeFromStream() {
  const pass = new stream.PassThrough();
  return sharp(pass)
    .metadata()
    .then((metadata) => {
      return {
        writeStream: pass,
        width: metadata.width,
        height: metadata.height
      };
    });
}

// Resize image stream (sharp).
function resizeStream({ width }) {
  return sharp().resize(width);
}

/**
 * A Lambda function that logs the payload received from S3.
 */
 exports.handler = async (event, context) => {
  console.log('here...');

  const record = event.Records[0].s3;

  const Key = record.object.key;
  const Bucket = record.bucket.name;


  try {
    // First, copy the original to a new file.
    const sanitizedKey = Key.replace(/\+/g, ' ');
    const keyWithoutExtension = sanitizedKey.replace(/.[^.]+$/, '');

    // Show keys and stuff.
    console.log('Original Key: ' + keyWithoutExtension);
    //console.log('prefix:' + prefix);

    if (keyWithoutExtension.includes(`_${prefix}`)) {
        console.log('Already a Thumbnail.');
        context.fail('Already a Thumbnail.');
        return;
      }

    // Infer the image type from the file suffix.
    const typeMatch = sanitizedKey.match(/\.([^.]*)$/);
    if (!typeMatch) {
      console.error('Could not determine the image type.');
      // context.fail('Could not determine the image type.');
      return;
    }

    // Check that the image type is supported
    const fileExt = typeMatch[1].toLowerCase();
    // if (
    //   fileExt != 'jpg' &&
    //   fileExt != 'png' &&
    //   fileExt != 'gif' &&
    //   fileExt != 'webp'
    // ) {
    //   console.error(`Unsupported image type: ${fileExt}`);
    //   // context.fail(`Unsupported image type: ${fileExt}`);
    //   return;
    // }

    console.log('File extension: ' + fileExt);

    let newKey = '';
    if (fileExt) {
      newKey += `${keyWithoutExtension}_${prefix}.${fileExt}`;
    } else {
      newKey += `${keyWithoutExtension}_${prefix}`;
    }
    console.log('newKey: ' + newKey);

    // Create a pipeline inline to read the metadata.
    //let origWidth;
    //let origHeight;
    //const pipeline = sharp().metadata().then(metadata =>{
    //    origWidth = metadata.width;
    //    origHeight = metadata.height;
    //});

    // Have to determine the original width and height.
    // Can that be done through a stream, or does it have to be done
    // before processing?
    // Compute ratio of width/height. width will always be 500 pixels in the end.
    const readStream = readStreamFromS3({ Bucket, Key });
    const resizeStreamVar = resizeStream({ width });
    const { writeStream, uploadFinished } = writeStreamToS3({
      Bucket,
      Key: newKey
    });

    // Trigger the stream.
    readStream.pipe(resizeStreamVar).pipe(writeStream);

    const uploadedDataResized = await uploadFinished;

    console.log('Image was resized:', JSON.stringify(uploadedDataResized));

    context.succeed();
  } catch (error) {
    console.log('Error calling S3 getObject: ' + error);
    console.error('Error calling S3 getObject:' + error);
    context.fail('Error calling S3 getObject: ' + error);
  }
};