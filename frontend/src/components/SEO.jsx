import React from 'react';
import { Helmet } from 'react-helmet-async';

const SEO = ({ 
  title = "Dolaglobo Finance",
  description = "Digital wallet and financial services provider in Kenya offering M-Pesa integration, personal loans, savings accounts, and airtime purchases.",
  keywords = "digital wallet Kenya, M-Pesa wallet, mobile money, personal loans Kenya",
  canonical,
  type = "website",
  image = "/og-image.png",
  noindex = false
}) => {
  const siteUrl = "https://dolaglobo.co.ke";
  const fullTitle = title === "Dolaglobo Finance" ? title : `${title} | Dolaglobo Finance`;
  const canonicalUrl = canonical ? `${siteUrl}${canonical}` : siteUrl;
  const imageUrl = image.startsWith('http') ? image : `${siteUrl}${image}`;

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      
      {/* Robots */}
      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}
      
      {/* Canonical */}
      <link rel="canonical" href={canonicalUrl} />
      
      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:site_name" content="Dolaglobo Finance" />
      <meta property="og:locale" content="en_KE" />
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={canonicalUrl} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
    </Helmet>
  );
};

export default SEO;
