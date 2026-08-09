const defaultNumbers = ' hai ba bốn năm sáu bảy tám chín';

const units = ('1 một' + defaultNumbers).split(' ');
const tens = ('lẻ mười' + defaultNumbers).split(' ');
const hundreds = ('không một' + defaultNumbers).split(' ');

export function numberToWords(number: number): string {
  if (number === 0) return 'Không đồng';
  
  let strNumber = Math.round(number).toString();
  let result = '';
  let arr: string[] = [];

  while (strNumber.length > 0) {
    arr.push(strNumber.substring(strNumber.length - 3));
    strNumber = strNumber.substring(0, strNumber.length - 3);
  }

  for (let i = arr.length - 1; i >= 0; i--) {
    let rs = '';
    let n3 = parseInt(arr[i]);
    if (n3 === 0 && arr.length > 1) continue;

    let d3 = Math.floor(n3 / 100);
    let d2 = Math.floor((n3 % 100) / 10);
    let d1 = n3 % 10;

    if (d3 > 0 || i < arr.length - 1) {
      rs += hundreds[d3] + ' trăm ';
    }
    
    if (d2 > 0) {
      rs += (d2 === 1 ? 'mười ' : tens[d2] + ' mươi ');
    } else if (d1 > 0 && d3 > 0) {
      rs += 'lẻ ';
    }

    if (d1 > 0) {
      if (d1 === 1 && d2 > 1) rs += 'mốt ';
      else if (d1 === 5 && d2 > 0) rs += 'lăm ';
      else rs += units[d1] + ' ';
    }

    if (rs) {
      if (i === 3) rs += 'tỷ ';
      else if (i === 2) rs += 'triệu ';
      else if (i === 1) rs += 'nghìn ';
    }
    
    result += rs;
  }

  result = result.trim() + ' đồng chẵn.';
  return result.charAt(0).toUpperCase() + result.slice(1);
}
