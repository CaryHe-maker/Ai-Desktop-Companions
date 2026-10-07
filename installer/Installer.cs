using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        using (SHA256 hash = SHA256.Create())
        using (Mutex single = new Mutex(false, "Local\\DeskbotInstaller-" + BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(root.ToLowerInvariant()))).Replace("-", "")))
        {
            if (!single.WaitOne(0)) { MessageBox.Show("此文件夹的安装器已经打开。", "Deskbot 安装"); return 2; }
            try
            {
                string desktop = null; bool portable = false;
                for (int i = 0; i < args.Length; i++) {
                    if (args[i] == "--desktop" && i + 1 < args.Length) desktop = Path.GetFullPath(args[++i]);
                    else if (args[i] == "--portable-node") portable = true;
                }
                using (InstallerForm form = new InstallerForm(root, desktop, portable))
                {
                    if (args.Length == 2 && args[0] == "--preview")
                    {
                        form.Show(); Application.DoEvents();
                        using (Bitmap bitmap = new Bitmap(form.Width, form.Height))
                        { form.DrawToBitmap(bitmap, new Rectangle(0, 0, form.Width, form.Height)); bitmap.Save(args[1]); }
                        form.Close(); return 0;
                    }
                    Application.Run(form);
                    return form.Result;
                }
            }
            finally { single.ReleaseMutex(); }
        }
    }
}

internal sealed class InstallerForm : Form
{
    private readonly string root;
    private readonly string desktop;
    private readonly bool portable;
    private readonly Label status = new Label();
    private readonly ProgressBar progress = new ProgressBar();
    private readonly Button install = new Button();
    private readonly Button cancel = new Button();
    private readonly Button logs = new Button();
    private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    private Process worker;
    private string statusFile;
    private string logFile;
    public int Result = 0;

    public InstallerForm(string projectRoot, string desktopPath, bool usePortableNode)
    {
        root = projectRoot;
        desktop = desktopPath; portable = usePortableNode;
        Text = "Deskbot · 桌面小伙伴安装";
        ClientSize = new Size(760, 560);
        FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.None;
        Font = new Font("Microsoft YaHei UI", 10F);
        BackColor = Color.FromArgb(249, 247, 252);
        string icon = Path.Combine(root, "assets", "gpt.ico");
        if (File.Exists(icon)) Icon = new Icon(icon);
        Label title = new Label { Text = "安装三位桌面小伙伴", Font = new Font(Font.FontFamily, 19F, FontStyle.Bold), Location = new Point(28, 24), Size = new Size(700, 42) };
        TextBox explanation = new TextBox {
            Multiline = true, ReadOnly = true, BorderStyle = BorderStyle.None,
            BackColor = BackColor, Font = new Font(Font.FontFamily, 9.5F), TabStop = false, Location = new Point(30, 86), Size = new Size(695, 305),
            Text = "点击“同意并安装”后，将联网下载并安装：\r\n" +
                   "• Node.js 24 LTS 和 npm：缺少兼容版本时下载官方便携版。\r\n" +
                   "• npm 锁定依赖：Electron、打包、图片处理及验证工具。\r\n" +
                   "来源：nodejs.org、registry.npmjs.org、Electron 官方 GitHub。\r\n\r\n" +
                   "完成后创建三个桌面快捷方式：GPT、Claude、DeepSeek。\r\n" +
                   "程序与缓存保存在本项目目录，无需管理员权限。\r\n" +
                   "首次下载数百 MB，请预留约 2 GB 空间。\r\n" +
                   "升级会保留用户数据，并备份旧程序。\r\n" +
                   "安装后请保留此文件夹；聊天在官网账号内登录。\r\n" +
                   "点击“取消”退出，不下载、不安装、不创建快捷方式。"
        };
        status.SetBounds(30, 405, 700, 42); status.Text = "准备就绪，等待你同意安装。";
        progress.SetBounds(30, 456, 700, 18);
        logs.Text = "查看日志"; logs.SetBounds(30, 498, 110, 35); logs.Visible = false;
        install.Text = "同意并安装"; install.SetBounds(470, 498, 145, 35);
        cancel.Text = "取消"; cancel.SetBounds(630, 498, 100, 35);
        Controls.AddRange(new Control[] { title, explanation, status, progress, logs, install, cancel });
        AcceptButton = install; CancelButton = cancel;
        install.Click += BeginInstall;
        cancel.Click += delegate { Close(); };
        logs.Click += delegate { if (File.Exists(logFile)) Process.Start("notepad.exe", Quote(logFile)); };
        timer.Interval = 300; timer.Tick += Poll;
        FormClosing += delegate(object sender, FormClosingEventArgs e) {
            if (worker != null && !worker.HasExited) { e.Cancel = true; status.Text = "安装正在进行，请等待完成后关闭窗口。"; }
        };
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        PerformAutoScale();
    }

    private void BeginInstall(object sender, EventArgs e)
    {
        string script = Path.Combine(root, "scripts", "windows", "install.ps1");
        if (!Environment.Is64BitOperatingSystem || Environment.OSVersion.Version.Major < 10)
        { status.Text = "需要 Windows 10 / 11 的 64 位环境。"; return; }
        if (!File.Exists(script) || !File.Exists(Path.Combine(root, "package-lock.json")) || !File.Exists(Path.Combine(root, "src", "main.cjs")))
        { status.Text = "项目文件不完整，请将完整仓库克隆后再运行根目录的 install.exe。"; return; }
        install.Enabled = false; cancel.Enabled = false;
        statusFile = Path.Combine(root, ".cache", "install", "status.json");
        logFile = Path.Combine(root, ".cache", "install", "install.log");
        try
        {
            // No network or filesystem mutation occurs before this consent event.
            if (File.Exists(statusFile)) File.Delete(statusFile);
            ProcessStartInfo start = new ProcessStartInfo {
                FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe"),
                Arguments = "-NoProfile -ExecutionPolicy Bypass -File " + Quote(script) + " -ProjectRoot " + Quote(root) + " -ConsentGranted" +
                    (desktop == null ? "" : " -DesktopPath " + Quote(desktop)) + (portable ? " -UsePortableNode" : ""),
                WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden
            };
            worker = Process.Start(start);
            status.Text = "正在检查环境…"; progress.Style = ProgressBarStyle.Marquee;
            timer.Start();
        }
        catch (Exception error)
        {
            status.Text = "无法启动安装：" + error.Message;
            install.Enabled = true; cancel.Enabled = true; Result = 1;
        }
    }

    private void Poll(object sender, EventArgs e)
    {
        try {
            if (File.Exists(statusFile)) {
                string content;
                using (FileStream stream = new FileStream(statusFile, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                using (StreamReader reader = new StreamReader(stream, Encoding.UTF8)) content = reader.ReadToEnd();
                Dictionary<string, object> data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(content);
                if (data != null && data.ContainsKey("message") && data.ContainsKey("percent")) {
                    status.Text = Convert.ToString(data["message"]);
                    progress.Style = ProgressBarStyle.Continuous;
                    progress.Value = Math.Max(0, Math.Min(100, Convert.ToInt32(data["percent"])));
                }
            }
        } catch (IOException) { } catch (ArgumentException) { } catch (InvalidOperationException) { }
        if (worker == null || !worker.HasExited) return;
        timer.Stop(); Result = worker.ExitCode;
        cancel.Enabled = true; cancel.Text = "完成"; logs.Visible = File.Exists(logFile);
        install.Visible = false; progress.Style = ProgressBarStyle.Continuous;
        if (Result == 0) { progress.Value = 100; status.Text = "安装完成！桌面已生成 GPT、Claude、DeepSeek 三个快捷方式。"; }
        else { status.Text = "安装未完成。" + status.Text + " 可查看日志，解决问题后重新运行 install.exe。"; }
    }

    private static string Quote(string value)
    {
        // Paths cannot contain quotes on Windows; double trailing slashes for native argv parsing.
        return "\"" + value.TrimEnd('\\') + "\"";
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing) { timer.Dispose(); if (worker != null) worker.Dispose(); }
        base.Dispose(disposing);
    }
}
