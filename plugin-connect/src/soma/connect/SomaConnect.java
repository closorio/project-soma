package soma.connect;

import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import java.awt.Color;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.HashSet;
import java.util.Set;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.scoreboard.Team;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * /connect bots | /connect NOMBRE y /disconnect bots | /disconnect NOMBRE: lanzan bot/conectar.sh de project-soma. Los nombres que admite (y que completa el tabulador)
 * los da el propio script (--listar), que los lee de mundos/<mundo>/personajes.json; aquí no hay ninguna lista.
 * La ruta del proyecto sale de config.yml (clave «proyecto»).
 */
public final class SomaConnect extends JavaPlugin implements Listener {
    private File script;
    private File personajes;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        File proyecto = new File(getConfig().getString("proyecto", "/home/count/codes/project-soma"));
        script = new File(proyecto, "bot/conectar.sh");
        personajes = new File(proyecto, "mundos/" + getConfig().getString("mundo", "companero") + "/personajes.json");
        getServer().getPluginManager().registerEvents(this, this);
        Bukkit.getOnlinePlayers().forEach(this::colorear); // tras un /reload ya están dentro
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

    // ---- Color de los bots: el de su puntero de la barra de localización ------------------------------------------------------
    // El cliente pinta el puntero de un jugador con ARGB.setBrightness(color(255, uuid.hashCode()), 0.9) (LocatorBar, 26.3): el
    // RGB son los 24 bits bajos del hashCode del UUID y se le fija el brillo en 0,9. Aquí se calcula igual y se usa ese mismo color
    // en el nombre del chat y de la lista de jugadores (exacto), en el puntero (por si el equipo del jugador lo cambiara) y en el
    // rótulo sobre la cabeza, que solo admite los 16 colores con nombre de un equipo: el más cercano.
    static int colorDelPuntero(java.util.UUID uuid) {
        int h = uuid.hashCode();
        float[] hsb = Color.RGBtoHSB((h >> 16) & 0xFF, (h >> 8) & 0xFF, h & 0xFF, null);
        return Color.HSBtoRGB(hsb[0], hsb[1], 0.9f) & 0xFFFFFF;
    }

    static NamedTextColor masCercano(int rgb) {
        NamedTextColor mejor = NamedTextColor.WHITE;
        long dMin = Long.MAX_VALUE;
        for (NamedTextColor c : NamedTextColor.NAMES.values()) {
            long dr = ((rgb >> 16) & 0xFF) - c.red(), dg = ((rgb >> 8) & 0xFF) - c.green(), db = (rgb & 0xFF) - c.blue();
            long d = dr * dr + dg * dg + db * db;
            if (d < dMin) { dMin = d; mejor = c; }
        }
        return mejor;
    }

    private Set<String> nombresDeBots() {
        Set<String> r = new HashSet<>();
        try {
            for (JsonElement e : JsonParser.parseString(java.nio.file.Files.readString(personajes.toPath())).getAsJsonObject().getAsJsonArray("personajes"))
                r.add(e.getAsJsonObject().get("nombre").getAsString());
        } catch (Exception e) {
            getLogger().warning("no puedo leer " + personajes + ": " + e.getMessage());
        }
        return r;
    }

    @EventHandler
    public void alEntrar(PlayerJoinEvent ev) {
        Player p = ev.getPlayer();
        Bukkit.getScheduler().runTask(this, () -> colorear(p)); // un tick después: el jugador ya está en el mundo
    }

    private void colorear(Player p) {
        if (!nombresDeBots().contains(p.getName())) return;
        int rgb = colorDelPuntero(p.getUniqueId());
        TextColor color = TextColor.color(rgb);
        p.displayName(Component.text(p.getName(), color));
        p.playerListName(Component.text(p.getName(), color));
        Team t = Bukkit.getScoreboardManager().getMainScoreboard().getTeam("soma_" + p.getName());
        if (t == null) t = Bukkit.getScoreboardManager().getMainScoreboard().registerNewTeam("soma_" + p.getName());
        t.color(masCercano(rgb));
        t.addEntry(p.getName());
        Bukkit.dispatchCommand(Bukkit.getConsoleSender(), String.format("waypoint modify %s color hex %06x", p.getName(), rgb));
    }
}
