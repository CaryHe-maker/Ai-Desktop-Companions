// A separate process acts as an ordinary external application in the Z-order test.
const {app,BrowserWindow}=require('electron');
app.setPath('userData',require('node:path').resolve('artifacts/layer-probe-data'));
app.whenReady().then(()=>{
 const w=new BrowserWindow({width:520,height:380,x:100,y:100,alwaysOnTop:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 w.loadURL('data:text/html,<title>Deskbot layer test</title><body style="background:%23daeaf2;font:24px sans-serif">Ordinary window test</body>');
});
app.on('window-all-closed',()=>app.quit());
