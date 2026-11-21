using System;
using System.IO;
using System.Text.RegularExpressions;
using Microsoft.Win32;

// This executable is built only for local QA and targets one explicitly named
// test application. The production uninstaller always displays confirmation.
internal static class UninstallerTestHarness
{
    private static int Main(string[] args)
    {
        if (args.Length != 1 || !Regex.IsMatch(args[0], "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")) return 2;
        using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\WebAppMaker." + args[0]))
        {
            if (key == null || !String.Equals(key.GetValue("DisplayName") as string, "WebAppMaker Native QA", StringComparison.Ordinal)) return 2;
        }
        string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WebAppMaker", "apps", args[0]);
        try { UninstallService.Remove(args[0], path, true, false); Console.WriteLine("Removal succeeded"); return 0; }
        catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
    }
}
