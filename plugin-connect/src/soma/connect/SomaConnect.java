package soma.connect;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * /connect bots | /connect NOMBRE y /disconnect bots | /disconnect NOMBRE: lanzan bot/conectar.sh de project-soma. Los nombres que admite (y que completa el tabulador)
 * los da el propio script (--listar), que los lee de mundos/<mundo>/personajes.json; aquí no hay ninguna lista.
 * La ruta del proyecto sale de config.yml (clave «proyecto»).
 */
public final class SomaConnect extends JavaPlugin {
    private File script;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        script = new File(getConfig().getString("proyecto", "/home/count/codes/project-soma"), "bot/conectar.sh");
        if (!script.isFile()) getLogger().warning("no encuentro " + script + ": cambia «proyecto» en plugins/SomaConnect/config.yml");
    }

    @Override
    public boolean onCommand(CommandSender quien, Command orden, String etiqueta, String[] args) {
        if (args.length == 0) return false;
        // solo nombres de personaje: nada de lo escrito llega a una shell (ProcessBuilder sin shell) y se corta a algo razonable
        List<String> pedidos = new ArrayList<>();
        for (String a : args) {
            if (!a.matches("[A-Za-z0-9_]{1,16}")) { quien.sendMessage("Nombre no válido: " + a); return true; }
            pedidos.add(a);
        }
        boolean desconectar = orden.getName().equalsIgnoreCase("disconnect");
        quien.sendMessage((desconectar ? "Desconectando " : "Conectando ") + String.join(", ", pedidos) + "…");
        List<String> params = new ArrayList<>();
        if (desconectar) params.add("--desconectar");
        params.addAll(pedidos);
        Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
            List<String> salida = ejecutar(params);
            Bukkit.getScheduler().runTask(this, () -> salida.forEach(quien::sendMessage));
        });
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender quien, Command orden, String etiqueta, String[] args) {
        // el script tarda unos ms: se pide una vez por ráfaga de tabulador, no en el hilo principal si se puede evitar
        List<String> todos = new ArrayList<>(List.of("bots"));
        todos.addAll(ejecutar(List.of("--listar")));
        String prefijo = args[args.length - 1].toLowerCase(Locale.ROOT);
        todos.removeIf(n -> !n.toLowerCase(Locale.ROOT).startsWith(prefijo));
        return todos;
    }

    private List<String> ejecutar(List<String> args) {
        List<String> salida = new ArrayList<>();
        try {
            List<String> cmd = new ArrayList<>(List.of("/usr/bin/bash", script.getPath()));
            cmd.addAll(args);
            Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String linea;
                while ((linea = r.readLine()) != null) salida.add(linea);
            }
            if (!p.waitFor(30, TimeUnit.SECONDS)) { p.destroyForcibly(); salida.add("conectar.sh no terminó en 30 s"); }
        } catch (Exception e) {
            salida.add("No se pudo lanzar conectar.sh: " + e.getMessage());
        }
        return salida;
    }
}
