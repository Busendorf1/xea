// lib/payment/utils.js

export function formatCreditCardNumber(value) {
  if (!value) {
    return value;
  }

  const clearValue = value.replace(/\D+/g, "");
  let nextValue;

  if (clearValue.length <= 4) {
    nextValue = clearValue;
  } else if (clearValue.length <= 8) {
    nextValue = `${clearValue.slice(0, 4)} ${clearValue.slice(4)}`;
  } else if (clearValue.length <= 12) {
    nextValue = `${clearValue.slice(0, 4)} ${clearValue.slice(
      4,
      8
    )} ${clearValue.slice(8)}`;
  } else {
    nextValue = `${clearValue.slice(0, 4)} ${clearValue.slice(
      4,
      8
    )} ${clearValue.slice(8, 12)} ${clearValue.slice(12, 16)}`;
  }

  return nextValue;
}

export function formatExpirationDate(value) {
  if (!value) {
    return value;
  }

  const clearValue = value.replace(/\D+/g, "");

  if (clearValue.length >= 3) {
    return `${clearValue.slice(0, 2)}/${clearValue.slice(2, 4)}`;
  }

  return clearValue;
}

export function formatCVC(value) {
  const clearValue = value.replace(/\D+/g, "");
  return clearValue.slice(0, 4);
}
