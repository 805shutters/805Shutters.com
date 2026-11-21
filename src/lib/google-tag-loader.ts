/** GTM can load the shared gtag library before our fallback runs. Keep the
 * queued configuration/events, but avoid downloading that library twice. */
export function googleTagLoader(id: string): string {
  return `(function(){
    var existing=Array.from(document.scripts).some(function(script){
      try { var url=new URL(script.src); return url.hostname==='www.googletagmanager.com' && url.pathname==='/gtag/js'; }
      catch(error){ return false; }
    });
    if(existing) return;
    var script=document.createElement('script');
    script.async=true;
    script.src=${JSON.stringify(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`)};
    document.head.appendChild(script);
  })();`;
}
