import { createHmac, timingSafeEqual } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { processBookingOutbox } from '@/lib/booking/delivery';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { BookingError } from '@/lib/booking/scheduling';
import { commitVoiceVisit, prepareVoiceVisit, VoiceReplan } from '@/lib/voice-805/scheduling';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 try{
  const key=process.env.VOICE_805_TOOLS_KEY||'';
  // This bridge may never address a shared/MTS database, including from a preview.
  if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://evuxqsaucmvgyuvjpqlo.supabase.co'||(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production'))return reply({error:'805 scheduling unavailable'},503);
  const at=request.headers.get('x-805-time')||'',nonce=request.headers.get('x-805-nonce')||'',sig=request.headers.get('x-805-signature')||'';
  if(key.length<32||!Number.isFinite(Number(at))||Math.abs(Date.now()-Number(at))>30000||!/^[0-9a-f-]{36}$/.test(nonce)||sig.length!==44||Number(request.headers.get('content-length')||0)>8192)return reply({error:'Rejected'},401);
  const raw=await request.text();if(Buffer.byteLength(raw)>8192)return reply({error:'Too large'},413);
  const expected=createHmac('sha256',key).update(`${at}\n${nonce}\n${raw}`).digest('base64');
  if(!timingSafeEqual(Buffer.from(expected),Buffer.from(sig)))return reply({error:'Rejected'},401);
  const {callId,dataset,action,input}=JSON.parse(raw);
  if(!/^[0-9a-f-]{36}$/.test(callId)||!['pilot','production'].includes(dataset)||!['find_appointments','prepare_appointment','commit'].includes(action))return reply({error:'Invalid action'},400);
  const db=getSupabaseServiceClient();if(!db)return reply({error:'Unavailable'},503);
  const {data,error}=await db.from('voice_805_state').select('body').eq('id',dataset).single();
  const call=data?.body?.entities?.call?.[callId];
  if(error||!call||!call.mediaStreamSid||(call.phase!=='message'&&!(action==='commit'&&call.booking?.verified)))return reply({error:'Call unavailable'},409);
  // Pilot calls may inspect availability but cannot create real CRM appointments.
  if(action!=='find_appointments'&&(dataset!=='production'||process.env.VOICE_805_BOOKING_AUTHORIZED!=='true'))return reply({error:'Booking activation required; offer a callback.'},503);
  if(action==='commit'){
   const booked=await commitVoiceVisit(db,callId,call);
   // Calendar verification already happened. Sending stays after the response; a failed handoff leaves the outbox row queued for the booking worker.
   try{after(async()=>{try{await processBookingOutbox(db,callId);}catch{console.error('Agent staff notice remains queued');}});}catch{/* cron drains pending notices outside a request scope */}
   return reply(booked);
  }
  if(action==='prepare_appointment'&&(call.bookingIntent?.confirmedAt||call.bookingAttention||call.booking?.verified))return reply({error:'Verify the existing booking outcome first.'},409);
  return reply(await prepareVoiceVisit(db,callId,input,action==='prepare_appointment'));
 }catch(error){return reply({replan:error instanceof VoiceReplan,error:error instanceof BookingError?error.message:'Scheduling could not be verified; offer a callback.'},error instanceof BookingError?error.status:503);}
}
