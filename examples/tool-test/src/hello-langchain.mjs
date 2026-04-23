import { ChatOpenAI } from '@langchain/openai';
import { getModelConfig } from './model-config.mjs';

const model = new ChatOpenAI(getModelConfig());

const response = await model.invoke("介绍下自己");
console.log(response.content);
