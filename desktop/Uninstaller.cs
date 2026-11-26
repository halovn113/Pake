using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Microsoft.Win32;
using System.Collections.Generic;
using System.Reflection;
using System.Security.Cryptography;
using System.Web.Script.Serialization;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        if (args.Length == 0)
        {
            try { LaunchRegisteredUninstaller(); }
            catch (Exception error) { MessageBox.Show(error.Message, "WebAppEz", MessageBoxButtons.OK, MessageBoxIcon.Error); }
            return;
        }
        if (args.Length != 1 || !Regex.IsMatch(args[0], "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"))
        {
            MessageBox.Show("Invalid application identity.", "WebAppEz", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        try { Application.Run(new UninstallWindow(args[0])); }
        catch (Exception error) { MessageBox.Show(error.Message, "WebAppEz", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    private static void LaunchRegisteredUninstaller()
    {
        string executable = Path.GetFullPath(Application.ExecutablePath);
        string appDir = Path.GetDirectoryName(executable);
        string id = Path.GetFileName(appDir);
        string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WebAppMaker");
        string expected = Path.Combine(root, "apps", id, "Uninstall.exe");
        if (!Regex.IsMatch(id ?? "", @"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$") || !String.Equals(executable, expected, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Invalid uninstaller location.");
        string command;
        using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\WebAppMaker." + id))
        {
            if (key == null || !String.Equals(Path.GetFullPath((key.GetValue("InstallLocation") as string) ?? ""), appDir, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Invalid application registration.");
            command = key.GetValue("UninstallString") as string;
        }
        Match match = Regex.Match(command ?? "", "^\"([^\"]+)\" ([0-9a-f-]+)$");
        string helper = match.Success ? Path.GetFullPath(match.Groups[1].Value) : "";
        string helperDir = Path.Combine(root, "uninstallers");
        string hash = Path.GetFileNameWithoutExtension(helper);
        if (!match.Success || match.Groups[2].Value != id || !String.Equals(Path.GetDirectoryName(helper), helperDir, StringComparison.OrdinalIgnoreCase) || !Regex.IsMatch(Path.GetFileName(helper), @"^[0-9a-f]{64}\.exe$")) throw new InvalidOperationException("Invalid uninstaller registration.");
        using (FileStream stream = File.OpenRead(helper)) using (SHA256 sha = SHA256.Create())
            if (!String.Equals(BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", ""), hash, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Uninstaller integrity check failed.");
        Process.Start(new ProcessStartInfo { FileName = helper, Arguments = id, UseShellExecute = false });
    }
}

internal static class UninstallService
{
    private static bool Same(string a, string b) { return String.Equals(Path.GetFullPath(a), Path.GetFullPath(b), StringComparison.OrdinalIgnoreCase); }
    private static void CheckDirectory(string path)
    {
        if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new IOException("Directory contains a link: " + path);
    }
    private static void CheckTree(string path)
    {
        CheckDirectory(path);
        foreach (string entry in Directory.GetFileSystemEntries(path))
        {
            FileAttributes attrs = File.GetAttributes(entry);
            if ((attrs & FileAttributes.ReparsePoint) != 0) throw new IOException("Directory contains a link: " + entry);
            if ((attrs & FileAttributes.Directory) != 0) CheckTree(entry);
        }
    }
    private static string ShortcutBase(string name)
    {
        string normalized = name.Normalize(System.Text.NormalizationForm.FormD);
        string result = Regex.Replace(normalized, "\\p{Mn}", "");
        result = Regex.Replace(result, "[^a-zA-Z0-9 _.-]", "_").Trim(' ', '.');
        if (result.Length == 0) result = "Web App";
        if (result.Length > 60) result = result.Substring(0, 60).TrimEnd(' ', '.');
        return result;
    }
    internal static void Remove(string id, string appPath, bool vietnamese, bool deleteData)
    {
        if (!Regex.IsMatch(id ?? "", "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")) throw new InvalidOperationException("Invalid identity.");
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string root = Path.Combine(local, "WebAppMaker", "apps");
        string expected = Path.Combine(root, id);
        if (!Same(appPath, expected)) throw new InvalidOperationException("Invalid application path.");
        CheckDirectory(Path.Combine(local, "WebAppMaker")); CheckDirectory(root); CheckTree(appPath);
        string registryPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\WebAppMaker." + id;
        using (RegistryKey key = Registry.CurrentUser.OpenSubKey(registryPath))
        {
            if (key == null || !Same((key.GetValue("InstallLocation") as string) ?? "", expected)) throw new InvalidOperationException("Invalid application registration.");
            string name = key.GetValue("DisplayName") as string;
            if (String.IsNullOrWhiteSpace(name)) throw new InvalidOperationException("Invalid application name.");
            string metadataPath = Path.Combine(appPath, "pake-runtime", "app.json");
            var metadata = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(metadataPath));
            string identity = "com.webappmaker.app" + id.Replace("-", "");
            object identifier;
            if (!metadata.TryGetValue("identifier", out identifier) || !String.Equals(identifier as string, identity, StringComparison.Ordinal)) throw new InvalidOperationException("Application identity does not match.");
            object exeValue; string exeName = metadata.TryGetValue("executableName", out exeValue) ? exeValue as string : "WebApp.exe";
            if (String.IsNullOrEmpty(exeName) || !Regex.IsMatch(exeName, @"^[a-zA-Z0-9_][a-zA-Z0-9 _.-]{0,59}\.exe$", RegexOptions.IgnoreCase) || Regex.IsMatch(exeName, @"[ .]\.exe$|^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)", RegexOptions.IgnoreCase)) throw new InvalidOperationException("Invalid executable name.");
            string exe = Path.Combine(appPath, exeName);
            foreach (Process process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(exeName)))
            {
                using (process) { try { if (Same(process.MainModule.FileName, exe)) throw new InvalidOperationException(vietnamese ? "Hãy đóng ứng dụng trước khi gỡ." : "Close the app before uninstalling it."); } catch (Win32Exception) { throw new InvalidOperationException("Cannot verify running application processes."); } catch (ArgumentException) { /* Process exited. */ } }
            }
            using (FileStream unused = new FileStream(exe, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) { }
            string start = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "WebAppMaker");
            string safeName = ShortcutBase(name);
            string legacy = Path.Combine(start, safeName + " [" + id.Substring(0, 8) + "].lnk");
            string plainBase = Regex.IsMatch(safeName, @"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)", RegexOptions.IgnoreCase) ? "Web App" : safeName;
            string plain = Path.Combine(start, plainBase + ".lnk");
            string shortcut = (key.GetValue("WebAppMakerShortcut") as string) ?? legacy;
            if (!Same(shortcut, plain) && !Same(shortcut, legacy)) throw new InvalidOperationException("Invalid shortcut path.");
            if (File.Exists(shortcut))
            {
                CheckDirectory(start);
                if ((File.GetAttributes(shortcut) & FileAttributes.ReparsePoint) != 0) throw new IOException("Unsafe shortcut.");
                Type shellType = Type.GetTypeFromProgID("WScript.Shell"); object shell = Activator.CreateInstance(shellType);
                object link = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcut });
                string target = (string) link.GetType().InvokeMember("TargetPath", BindingFlags.GetProperty, null, link, null);
                if (!Same(target, exe)) throw new InvalidOperationException("Shortcut belongs to another application.");
            }
            string profileRoot = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string profile = Path.Combine(profileRoot, identity);
            if (deleteData && Directory.Exists(profile)) { if (!Same(Path.GetDirectoryName(profile), profileRoot)) throw new InvalidOperationException("Invalid profile path."); CheckTree(profile); Directory.Delete(profile, true); }
            Directory.Delete(appPath, true);
            if (File.Exists(shortcut)) File.Delete(shortcut);
        }
        Registry.CurrentUser.DeleteSubKey(registryPath);
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
    private readonly CheckBox deleteData;
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
        Text = T("Gỡ ứng dụng", "Uninstall application");
        ClientSize = new Size(500, 255);
        MinimumSize = new Size(516, 294);
        MaximumSize = MinimumSize;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Font = new Font("Segoe UI", 9F);
        Controls.Add(new Label { Text = T("Gỡ ", "Uninstall ") + appName + "?", Font = new Font("Segoe UI", 14F, FontStyle.Bold), AutoEllipsis = true, Location = new Point(24, 20), Size = new Size(450, 32) });
        Controls.Add(new Label { Text = T("Ứng dụng và shortcut sẽ được gỡ.", "The app and its shortcut will be removed."), Location = new Point(26, 62), Size = new Size(445, 25) });
        deleteData = new CheckBox { Text = T("Xóa cả dữ liệu và thông tin đăng nhập", "Also delete app data and sign-in information"), Location = new Point(26, 98), AutoSize = true, Checked = false };
        Controls.Add(deleteData);
        status = new Label { Location = new Point(26, 135), Size = new Size(445, 22), Text = T("Đóng ứng dụng trước khi tiếp tục.", "Close the app before continuing.") };
        Controls.Add(status);
        progress = new ProgressBar { Location = new Point(26, 162), Size = new Size(445, 9), Style = ProgressBarStyle.Marquee, Visible = false };
        Controls.Add(progress);
        remove = new Button { Text = T("Gỡ ứng dụng", "Uninstall"), Location = new Point(278, 204), Size = new Size(105, 30) };
        cancel = new Button { Text = T("Hủy", "Cancel"), Location = new Point(390, 204), Size = new Size(80, 30), DialogResult = DialogResult.Cancel };
        remove.Click += StartRemoval;
        Controls.Add(remove); Controls.Add(cancel);
        AcceptButton = remove; CancelButton = cancel;
        FormClosing += delegate(object sender, FormClosingEventArgs e) { if (busy) e.Cancel = true; };
    }

    private string T(string vi, string en) { return vietnamese ? vi : en; }

    private void StartRemoval(object sender, EventArgs e)
    {
        bool shouldDeleteData = deleteData.Checked;
        if (shouldDeleteData && MessageBox.Show(this, T("Xóa vĩnh viễn dữ liệu và thông tin đăng nhập của ứng dụng?", "Permanently delete this app’s data and sign-in information?"), Text, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        busy = true; remove.Enabled = false; cancel.Enabled = false; deleteData.Enabled = false; progress.Visible = true;
        status.Text = T("Đang gỡ ứng dụng…", "Removing the application…");
        BackgroundWorker worker = new BackgroundWorker();
        worker.DoWork += delegate(object unused, DoWorkEventArgs result)
        {
            UninstallService.Remove(id, appPath, vietnamese, shouldDeleteData);
        };
        worker.RunWorkerCompleted += delegate(object unused, RunWorkerCompletedEventArgs result)
        {
            busy = false; progress.Visible = false;
            if (result.Error != null)
            {
                status.Text = T("Không thể gỡ ứng dụng.", "The application could not be removed.");
                MessageBox.Show(this, result.Error.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
                remove.Enabled = true; cancel.Enabled = true; deleteData.Enabled = true; return;
            }
            MessageBox.Show(this, (shouldDeleteData ? T("Đã gỡ ứng dụng và xóa dữ liệu.", "The app and its data were removed.") : T("Đã gỡ ứng dụng. Dữ liệu đăng nhập vẫn được giữ.", "The app was removed. Sign-in data was kept.")), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            Close();
        };
        worker.RunWorkerAsync();
    }
}
