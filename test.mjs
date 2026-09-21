import {parseBetMessage} from './src/parser.js';
const xs=['30.10,90-64/56:57=50','ဒဲ့300®200','တာတေ 7\n76®100','နခတ် R50','ပါဝါ 100','ပါဝါ/နခတ် 50','0123456789 ဘရိတ်500','0123456789 br500','0123456789 bk500','0123456789 ထိပ်/ပိတ် 500','0123456789 ထိပ်/ပိတ်အပူးပါ 500','867ထိပ်/ပိတ်500','867ထိပ်-ပိတ်500','867ထိပ်:ပိတ်500'];
for(const x of xs){try{const r=parseBetMessage(x);console.log('OK',x,'=>',r.grandTotal,r.count)}catch(e){console.log('ERR',x,e.message)}}
