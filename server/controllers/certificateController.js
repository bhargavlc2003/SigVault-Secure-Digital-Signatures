const pool = require('../config/db'); 
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getClientIp } = require('@supercharge/request-ip');
const multer = require('multer');
const os = require('os');
const { DateTime } = require("luxon");

const { compareFaces } = require('./faceverificationController');

//face verification
const verifyFace = async (req, res) => {
    try {
      const upload = multer({ dest: 'uploads/' }).single('signatoryphoto');
      upload(req, res, async (err) => {
        if (err) {
          return res.status(400).json({ success: false, message: 'File upload failed' });
        }
  
        const userId = req.user.id;
        const capturedImagePath = req.file.path;
  
        if (!userId || !capturedImagePath) {
          return res.status(400).json({ success: false, message: 'Missing required data' });
        }
  
        const result = await pool.query('SELECT photo FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0 || !result.rows[0].photo) {
          return res.status(404).json({ success: false, message: 'User photo not found' });
        }

        const storedImagePath = result.rows[0].photo; // e.g., "uploads/550e8400-e29b-41d4-a716-446655440000.jpg"
        // Construct full URL
        const baseUrl = 'http://localhost:5000';
        const storedImageUrl = `${baseUrl}/${storedImagePath}`; // e.g., "http://localhost:5000/uploads/550e8400-e29b-41d4-a716-446655440000.jpg"
        
        console.log('Stored image URL sent to frontend:', storedImageUrl); // Debug log
  
        const matchResult = await compareFaces(storedImagePath, capturedImagePath);
  
        fs.unlinkSync(capturedImagePath);
  
        return res.json({
          ...matchResult,
          storedImage: storedImageUrl // Send full URL to frontend
        });
      });
    } catch (error) {
      console.error('Error verifying face:', error);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  };//end of face verification

  const getClientIP = (req) => {
    let ip = getClientIp(req) || 'unknown';
    
    // Convert IPv6 to IPv4 if possible, handle localhost
    if (ip === '::1' || ip === '::ffff:127.0.0.1') {
        return '127.0.0.1';
    }
    
    // If it's an IPv6 address (contains ':'), return 'unknown' or extract IPv4 if embedded
    if (ip.includes(':')) {
        // Check for IPv4-mapped IPv6 address (e.g., ::ffff:192.168.1.1)
        const ipv4Match = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/);
        return ipv4Match ? ipv4Match[1] : 'unknown';
    }
    
    // Basic IPv4 validation
    const ipv4Regex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    return ipv4Regex.test(ip) ? ip : 'unknown';
};

// Function to generate SHA-256 hash
const generateHash = (data) => crypto.createHash('sha256').update(data).digest('hex');

// Function to get next certificate number
const getNextCertificateNumber = async () => {
    const { rows } = await pool.query("SELECT MAX(certificatenumber) FROM certificates");
    let lastNumber = rows[0].max ? parseInt(rows[0].max) : 0;
    return (lastNumber + 1).toString().padStart(4, '0');
};
// const getClientIP = (req) => {
//     const forwarded = req.headers['x-forwarded-for'];
//     let ip = forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress;

//     // Convert IPv6 localhost to IPv4
//     if (ip === '::1') {
//         ip = '127.0.0.1';
//     }

//     return ip;
// };

// Create Certificate 
const createCertificate = async (req, res) => {
    try {
        // Generate Certificate Number
        const certificateNumber = await getNextCertificateNumber();
        req.certificateNumber = certificateNumber;
        console.log("Generated Certificate Number:", certificateNumber); // Debugging

        // Set up Multer manually inside the controller
        const upload = multer({
            storage: multer.diskStorage({
                destination: (req, file, cb) => {
                    const certDir = path.join(__dirname, '../certificate_images', certificateNumber);
                    fs.mkdirSync(certDir, { recursive: true });
                    cb(null, certDir);
                },
                filename: (req, file, cb) => {
                    cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`);
                }
            })
        }).fields([
            { name: 'docphoto', maxCount: 1 },
            { name: 'signphoto', maxCount: 1 },
            { name: 'signatoryphoto', maxCount: 1 }
        ]);

        // Run Multer upload
        upload(req, res, async (err) => {
            if (err) {
                console.error("Multer error:", err);
                return res.status(400).json({ error: "File upload failed" });
            }

            console.log("Uploaded files:", req.files); // Debugging

            const { particulars, description, signatoryname, expirydate, location } = req.body;
            const email = req.user.email;
            const deviceIp = getClientIP(req);
            const creationDate = DateTime.now().setZone('Asia/Kolkata').toISODate();
            const creationTime = new Date().toTimeString().split(' ')[0];

            // Rename and move uploaded files
            const renameFile = (file, newName) => {
                if (file) {
                    const newPath = path.join(__dirname, '../certificate_images', certificateNumber, newName);
                    fs.renameSync(file.path, newPath);
                    return newPath;
                }
                return null;
            };

            const docPhoto = req.files['docphoto'] ? renameFile(req.files['docphoto'][0], `docphoto_${certificateNumber}.jpg`) : null;
            const signPhoto = req.files['signphoto'] ? renameFile(req.files['signphoto'][0], `signphoto_${certificateNumber}.jpg`) : null;
            const signatoryPhoto = req.files['signatoryphoto'] ? renameFile(req.files['signatoryphoto'][0], `signatoryphoto_${certificateNumber}.jpg`) : null;

            // Generate hash
            const hashData = `${certificateNumber}${email}${particulars}${description}${signatoryname}${expirydate}`;
            const hash = generateHash(hashData);

            // Insert into database
            await pool.query(
                `INSERT INTO certificates (certificatenumber, email, particulars, description, signatoryname, creationdate, creationtime, deviceip, expirydate, signatoryphoto, signaturephoto, documentphoto, hash, location) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                [certificateNumber, email, particulars, description, signatoryname, creationDate, creationTime, deviceIp, expirydate, signatoryPhoto, signPhoto, docPhoto, hash, location]
            );

            res.status(201).json({ message: 'Certificate created successfully', certificateNumber });
        });

    } catch (error) {
        console.error("Error in createCertificate:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};//end of create certificate

//1) Get all certificates belonging to the logged-in user
const getUserCertificates = async (req, res) => {
    const { email } = req.user; // Extract email from the JWT token

    try {
        const query = 'SELECT * FROM certificates WHERE email = $1 ORDER BY creationdate DESC;';
        const { rows } = await pool.query(query, [email]);

        res.json(rows);
    } catch (error) {
        console.error('Error fetching user certificates:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};// end of 1)

//2) Get a specific certificate by certificate number (only for the logged-in user)
const getCertificateByNumber = async (req, res) => {
    const { certificatenumber } = req.params;
    const { email } = req.user; // Extract email from JWT

    try {
        const query = 'SELECT * FROM certificates WHERE certificatenumber = $1 AND email = $2;';
        const { rows } = await pool.query(query, [certificatenumber, email]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Certificate not found or unauthorized' });
        }

        let certificate = rows[0];

        // Define the base URL for images
        const baseUrl = `http://localhost:5000/certificate_images/${certificatenumber}`;

        // Convert stored file paths to public URLs
        certificate = {
            ...certificate,
            documentphoto: certificate.documentphoto ? `${baseUrl}/${path.basename(certificate.documentphoto)}` : null,
            signaturephoto: certificate.signaturephoto ? `${baseUrl}/${path.basename(certificate.signaturephoto)}` : null,
            signatoryphoto: certificate.signatoryphoto ? `${baseUrl}/${path.basename(certificate.signatoryphoto)}` : null,
        };

        res.json(certificate);
    } catch (error) {
        console.error('Error fetching certificate:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}; //end of 2) 

//3) Deletion of Created Signature Certificate for logged in user
const deleteCertificate = async (req, res) => {
    const { certificatenumber } = req.params;
    const { email } = req.user; // Extract user email from JWT

    try {
        // Verify that the certificate exists and belongs to the user
        const query = 'SELECT * FROM certificates WHERE certificatenumber = $1 AND email = $2';
        const { rows } = await pool.query(query, [certificatenumber, email]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Certificate not found or unauthorized' });
        }

        // Get the folder path
        const certDir = path.join(__dirname, '../certificate_images', certificatenumber);

        // Delete certificate record from the database
        await pool.query('DELETE FROM certificates WHERE certificatenumber = $1 AND email = $2', [certificatenumber, email]);

        // Remove certificate images directory if it exists
        if (fs.existsSync(certDir)) {
            fs.rmSync(certDir, { recursive: true, force: true });
        }

        res.json({ message: 'Certificate deleted successfully' });
    } catch (error) {
        console.error('Error deleting certificate:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};// end of 3)



module.exports = { getUserCertificates, getCertificateByNumber, createCertificate, deleteCertificate,verifyFace};
