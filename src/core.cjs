const PETS=['gpt','claude','deepseek'];
function validPet(id){if(!PETS.includes(id))throw new Error('未知角色');return id;}
function safeURL(value){
 try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
module.exports={PETS,validPet,safeURL};
