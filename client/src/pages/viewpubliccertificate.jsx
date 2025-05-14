import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Styles/viewcertificate.css'; 

const ViewPublicCertificate = () => {
  const { certificateNumber } = useParams();
  const [certificate, setCertificate] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCertificate = async () => {
      try {
        const response = await axios.get(`http://localhost:5000/api/publiccertificate/${certificateNumber}`);
        setCertificate(response.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Error fetching certificate');
      }
    };

    const fetchQRCode = async () => {
      try {
        const response = await axios.get(`http://localhost:5000/api/qr/${certificateNumber}`);
        if (response.data.qr_code) {
          setQrCode(response.data.qr_code);
        }
      } catch (err) {
        console.error('Error fetching QR Code:', err);
      }
    };

    fetchCertificate();
    fetchQRCode();
  }, [certificateNumber]);

  if (error) return <p className="error-message">{error}</p>;
  if (!certificate) return <p>Loading certificate...</p>;

  return (
    <div className="certificate-view">
      <h2>Certificate Verification</h2>
      <p><strong>Certificate Number:</strong> {certificate.certificatenumber}</p>
      <p><strong>Particulars:</strong> {certificate.particulars}</p>
      <p><strong>Description:</strong> {certificate.description}</p>
      <p><strong>Signatory:</strong> {certificate.signatoryname}</p>
      <p><strong>Creation Date:</strong> {new Date(certificate.creationdate).toLocaleDateString('en-GB')}</p>
      <p><strong>Creation Time:</strong> {certificate.creationtime}</p>
      <p><strong>IP Address:</strong> {certificate.deviceip}</p>
      <p><strong>Location:</strong> {certificate.location}</p>
      <p><strong>Expiry Date: </strong>{new Date(certificate.expirydate).toLocaleDateString('en-GB')}</p>
      <p><strong>Certificate Hash:</strong> {certificate.hash}</p>
      {certificate.documentphoto && (
        <p><strong>Document Photo:</strong><br />
          <img src={certificate.documentphoto} alt="Document" width="300" />
        </p>
      )}
      {certificate.signaturephoto && (
        <p><strong>Signature:</strong><br />
          <img src={certificate.signaturephoto} alt="Signature" width="300" />
        </p>
      )}
      {certificate.signatoryphoto && (
        <p><strong>Signatory Photo:</strong><br />
          <img src={certificate.signatoryphoto} alt="Signatory" width="300" />
          <h3>✅ Face Verified with the Owner</h3>
        </p>
      )}
      {qrCode && (
        <p><strong>Verification QR Code:</strong><br />
          <img src={qrCode} alt="QR Code" width="200" />
        </p>
      )}
      <button onClick={() => navigate('/verification')}>Back to Verification</button>
    </div>
  );
};

export default ViewPublicCertificate;