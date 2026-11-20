using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        if (args.Length != 1 || !Regex.IsMatch(args[0], "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"))
        {
            MessageBox.Show("Invalid application identity.", "WebAppMaker", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        try { Application.Run(new UninstallWindow(args[0])); }
        catch (Exception error) { MessageBox.Show(error.Message, "WebAppMaker", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
}

internal static class UninstallService
{
    internal static void Remove(string id, string appPath, bool vietnamese)
    {
        string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe");
        string helper = Path.Combine(appPath, "uninstall.ps1");
        ProcessStartInfo start = new ProcessStartInfo(powershell, "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + helper + "\" -Action Remove -AppId " + id + " -SilentError") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true, RedirectStandardOutput = true };
        using (Process process = Process.Start(start))
        {
            if (process == null) throw new InvalidOperationException("Could not start the removal helper.");
            string error = process.StandardError.ReadToEnd();
            process.StandardOutput.ReadToEnd();
            process.WaitForExit();
            if (process.ExitCode != 0)
            {
                if (error.IndexOf("Close the application before uninstalling", StringComparison.OrdinalIgnoreCase) >= 0)
                    throw new InvalidOperationException(vietnamese ? "Hãy đóng ứng dụng trước khi gỡ." : "Close the app before uninstalling it.");
                throw new InvalidOperationException(String.IsNullOrWhiteSpace(error) ? "Removal failed." : error.Trim());
            }
        }
    }
}

internal sealed class UninstallWindow : Form
{
    private readonly string id;
    private readonly string appPath;
    private readonly string appName;
    private readonly bool vietnamese;
    private readonly Button remove;
    private readonly Button cancel;
    private readonly Label status;
    private readonly ProgressBar progress;
    private bool busy;

    public UninstallWindow(string id)
    {
        this.id = id;
        string language = null;
        string expected = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WebAppMaker", "apps", id);
        using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\WebAppMaker." + id))
        {
            if (key == null) throw new InvalidOperationException(T("Không tìm thấy ứng dụng đã cài.", "The installed application could not be found."));
            appName = key.GetValue("DisplayName") as string;
            appPath = key.GetValue("InstallLocation") as string;
            language = key.GetValue("WebAppMakerLanguage") as string;
            if (String.IsNullOrWhiteSpace(appName) || !String.Equals(Path.GetFullPath(appPath ?? ""), Path.GetFullPath(expected), StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException(T("Thông tin ứng dụng không hợp lệ.", "The application registration is invalid."));
        }
        vietnamese = String.Equals(language, "vi", StringComparison.OrdinalIgnoreCase) || (String.IsNullOrEmpty(language) && CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "vi");
        if (!File.Exists(Path.Combine(appPath, "uninstall.ps1"))) throw new FileNotFoundException(T("Không tìm thấy bộ gỡ ứng dụng.", "The removal helper could not be found."));
        Text = T("Gỡ ứng dụng", "Uninstall application");
        ClientSize = new Size(500, 225);
        MinimumSize = new Size(516, 264);
        MaximumSize = MinimumSize;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Font = new Font("Segoe UI", 9F);
        Controls.Add(new Label { Text = T("Gỡ ", "Uninstall ") + appName + "?", Font = new Font("Segoe UI", 14F, FontStyle.Bold), AutoEllipsis = true, Location = new Point(24, 20), Size = new Size(450, 32) });
        Controls.Add(new Label { Text = T("Ứng dụng và shortcut sẽ được gỡ. Dữ liệu đăng nhập được giữ lại.", "The app and its shortcut will be removed. Sign-in data will be kept."), Location = new Point(26, 62), Size = new Size(445, 45) });
        status = new Label { Location = new Point(26, 112), Size = new Size(445, 22), Text = T("Đóng ứng dụng trước khi tiếp tục.", "Close the app before continuing.") };
        Controls.Add(status);
        progress = new ProgressBar { Location = new Point(26, 140), Size = new Size(445, 9), Style = ProgressBarStyle.Marquee, Visible = false };
        Controls.Add(progress);
        remove = new Button { Text = T("Gỡ ứng dụng", "Uninstall"), Location = new Point(278, 174), Size = new Size(105, 30) };
        cancel = new Button { Text = T("Hủy", "Cancel"), Location = new Point(390, 174), Size = new Size(80, 30), DialogResult = DialogResult.Cancel };
        remove.Click += StartRemoval;
        Controls.Add(remove); Controls.Add(cancel);
        AcceptButton = remove; CancelButton = cancel;
        FormClosing += delegate(object sender, FormClosingEventArgs e) { if (busy) e.Cancel = true; };
    }

    private string T(string vi, string en) { return vietnamese ? vi : en; }

    private void StartRemoval(object sender, EventArgs e)
    {
        busy = true; remove.Enabled = false; cancel.Enabled = false; progress.Visible = true;
        status.Text = T("Đang gỡ ứng dụng…", "Removing the application…");
        BackgroundWorker worker = new BackgroundWorker();
        worker.DoWork += delegate(object unused, DoWorkEventArgs result)
        {
            UninstallService.Remove(id, appPath, vietnamese);
        };
        worker.RunWorkerCompleted += delegate(object unused, RunWorkerCompletedEventArgs result)
        {
            busy = false; progress.Visible = false;
            if (result.Error != null)
            {
                status.Text = T("Không thể gỡ ứng dụng.", "The application could not be removed.");
                MessageBox.Show(this, result.Error.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
                remove.Enabled = true; cancel.Enabled = true; return;
            }
            MessageBox.Show(this, T("Đã gỡ ứng dụng. Dữ liệu đăng nhập vẫn được giữ.", "The app was removed. Sign-in data was kept."), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            Close();
        };
        worker.RunWorkerAsync();
    }
}
