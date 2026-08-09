export const formatCurrency = (val: any) => {
  if (val === null || val === undefined) return '0';
  return new Intl.NumberFormat('vi-VN').format(val);
};

export const formatDate = (val: any) => {
  if (!val) return '';
  const d = new Date(val);
  return d.toLocaleDateString('vi-VN');
};
