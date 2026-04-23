import { getEncoding, getEncodingNameForModel } from "js-tiktoken"; 

const modelName = "gpt-4"; 
const encodingName = getEncodingNameForModel(modelName);
console.log(encodingName);

const enc = getEncoding("cl100k_base");
console.log('apple', enc.encode("apple").length); // 1
console.log('pineapple', enc.encode("pineapple").length); // 2
console.log('苹果', enc.encode("苹果").length); // 3
console.log('吃饭', enc.encode("吃饭").length); // 5
console.log('一二三', enc.encode("一二三").length); // 3
