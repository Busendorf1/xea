const calculateExpirationDate = (): string => {
  const now = new Date();
  now.setMonth(now.getMonth() + 1); // Example: Expiry in 1 month
  return now.toISOString();
};

export default calculateExpirationDate;
