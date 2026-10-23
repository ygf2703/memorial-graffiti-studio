import {getStore} from "@netlify/blobs";
import {authorize,json,validId,workerToken} from "../../server/core.mjs";
import {queueRecompose} from "../../server/recompose.mjs";
export default async request=>{
  if(request.method!=="POST")return json({error:"הפעולה אינה נתמכת."},405);
  const denied=authorize(request);if(denied)return denied;
  const {id}=await request.json().catch(()=>({}));
  if(!validId(id))return json({error:"מזהה בקשה לא תקין."},400);
  const base=process.env.NETLIFY_DEV==="true"?new URL(request.url).origin:process.env.STUDIO_SITE_URL;
  if(!base)return json({error:"כתובת שירות הרקע לא הוגדרה."},503);
  let queued;
  try{queued=await queueRecompose(getStore({name:"graffiti-jobs",consistency:"strong"}),id);}
  catch{return json({error:"אפשר לסדר מחדש רק תוצאה שנכשלה במיקום השם ותמונת הבסיס שלה נשמרה."},409);}
  try{
    if(queued.status==="queued"){
      const r=await fetch(new URL("/.netlify/functions/render-background",base),{method:"POST",headers:{"content-type":"application/json","x-worker-token":workerToken(queued.id)},body:JSON.stringify({id:queued.id}),signal:AbortSignal.timeout(10000)});
      if(!r.ok)throw Error("Worker not accepted");
    }
    return json({id:queued.id},202);
  }catch{return json({error:"המסירה לא אושרה. אפשר ללחוץ שוב; לא תירכש יצירת דיוקן נוספת."},503);}
};
