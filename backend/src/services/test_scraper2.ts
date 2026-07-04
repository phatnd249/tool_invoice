import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const r = await axios.get('https://masothue.com/Search/?q=0314377455&type=enterpriseTax', { validateStatus: () => true, maxRedirects: 0 });
  console.log(r.status, r.headers.location);
}
run();
