import axios from 'axios';

function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function run() {
  const name = 'CÔNG TY CỔ PHẦN CYBER JUTSU';
  const slug = slugify(name);
  const code = '0314377455';
  const url = `https://masothue.com/${code}-${slug}`;
  
  const r = await axios.get(url, {
    validateStatus: () => true,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  console.log('Status:', r.status);
}
run();
