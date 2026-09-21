import {parseBetMessage} from './src/parser.js';
const xs=['0123456789 ထိပ်/ပိတ် 500','0123456789 ထိပ်/ပိတ်အပူးပါ 500','867ထိပ်-ပိတ်500','ပါဝါ/ညီကို 100','နခတ်/ပါဝါ/ညီကို 100','အပူး/နခတ်/ပါဝါ 100','တာတေ\n76®100','ဂျပန် 11\n12 13r100'];
for(const x of xs){try{const r=parseBetMessage(x);console.log('OK',JSON.stringify(x),r.grandTotal,r.count)}catch(e){console.log('ERR',JSON.stringify(x),e.message)}}
