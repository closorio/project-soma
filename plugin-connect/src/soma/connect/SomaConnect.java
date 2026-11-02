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
import java.util.LinkedHashMap;
import java.util.Map.Entry;
import java.util.TreeMap;
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
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.permissions.PermissionAttachment;
import org.bukkit.plugin.java.JavaPlugin;
import java.util.HashMap;
import java.util.Map;

/**
 * /connect bots | /connect NOMBRE y /disconnect bots | /disconnect NOMBRE: lanzan bot/conectar.sh de project-soma. Los nombres que admite (y que completa el tabulador)
 * los da el propio script (--listar), que los lee de mundos/<mundo>/personajes.json; aquí no hay ninguna lista.
 * La ruta del proyecto sale de config.yml (clave «proyecto»).
 * Rol «bot operator» (2026-11-02): /bo JUGADOR lo da y /debo JUGADOR lo quita (solo admins: somaconnect.admin, op por defecto). Queda guardado en
 * plugins/SomaConnect/operadores.yml y se aplica al entrar como el permiso somaconnect.operator. Un bot operator, sin ser op, usa /connect y
 * /disconnect solo con SUS bots (los de su entrada «dueno» en personajes.json): el plugin le añade «--de SU_NOMBRE» al script. Un op (o la
 * consola) maneja todos, como siempre.
 * Marca de bot (2026-11-02): los bots mandan el brand del cliente «soma-bot;dueno=NOMBRE» (bot/io.js, opción brand de mineflayer); al entrar, el
 * plugin lo lee (Player#getClientBrandName, llega al cabo de ~1 s) y colorea al que lo trae. La lista de personajes.json queda de respaldo.
 */
public final class SomaConnect extends JavaPlugin implements Listener {
    private File script;
    private File personajes;
    private File jugadores; // 2026-11-02: el plantel del mundo compartido, mundos/<mundo>/jugadores/<jugador>.json (bot/plantel.js)
    private File ficheroOperadores;
    private final Set<String> operadores = new HashSet<>(); // nombres en minúsculas
    private final Map<java.util.UUID, PermissionAttachment> permisos = new HashMap<>();
    // Canal «soma:duenos» (2026-11-02): bot conectado → su dueño (del brand). Se empuja a cada bot como JSON {"dueno":["Bot",...]}; el bot
    // se registra en el canal al entrar (bot/io.js). La lista de personajes.json queda de respaldo en el bot.
    private static final String CANAL = "soma:duenos";
    private final Map<String, String> duenos = new LinkedHashMap<>();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        File proyecto = new File(getConfig().getString("proyecto", "/home/count/codes/project-soma"));
        script = new File(proyecto, "bot/conectar.sh");
        // 2026-11-02: los personajes son de cada persona: personajes.local.json (no se versiona; conectar.sh lo hace de personajes.json si falta)
        String carpeta = "mundos/" + getConfig().getString("mundo", "companero");
        personajes = new File(proyecto, carpeta + "/personajes.local.json");
        if (!personajes.exists()) personajes = new File(proyecto, carpeta + "/personajes.json");
        jugadores = new File(proyecto, carpeta + "/jugadores");
        ficheroOperadores = new File(getDataFolder(), "operadores.yml");
        operadores.addAll(YamlConfiguration.loadConfiguration(ficheroOperadores).getStringList("operadores"));
        getServer().getPluginManager().registerEvents(this, this);
        getServer().getMessenger().registerOutgoingPluginChannel(this, CANAL);
        Bukkit.getOnlinePlayers().forEach(this::aplicarRol);
        Bukkit.getOnlinePlayers().forEach(this::colorear); // tras un /reload ya están dentro
        if (!script.isFile()) getLogger().warning("no encuentro " + script + ": cambia «proyecto» en plugins/SomaConnect/config.yml");
    }

    @Override
    public boolean onCommand(CommandSender quien, Command orden, String etiqueta, String[] args) {
        String nombreOrden = orden.getName().toLowerCase(Locale.ROOT);
        if (nombreOrden.equals("bo") || nombreOrden.equals("debo")) return darOQuitarRol(quien, nombreOrden.equals("bo"), args);
        if (args.length == 0) return false;
        String de = alcance(quien); // null = todos los bots; "" = sin permiso; si no, el nombre del bot operator
        if (de != null && de.isEmpty()) { quien.sendMessage("No tienes permiso: pide a un admin que te dé el rol con /bo " + quien.getName() + "."); return true; }
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
        if (de != null) { params.add("--de"); params.add(de); }
        params.addAll(pedidos);
        // 2026-11-02: los bots de un jugador con «lanzador» en su jugadores/<jugador>.json corren en su PC: se le pide a su lanzador
        // (bot/lanzador.js) con la clave de config.yml (claves.<jugador>); sin lanzador o sin clave, conectar.sh aquí, como siempre
        String lanzador = de != null ? lanzadorDe(de) : null, clave = de != null ? getConfig().getString("claves." + de, "") : "";
        Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
            List<String> salida = lanzador != null && !clave.isEmpty() ? pedirALanzador(lanzador, clave, de, pedidos, desconectar) : ejecutar(params);
            Bukkit.getScheduler().runTask(this, () -> salida.forEach(quien::sendMessage));
        });
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender quien, Command orden, String etiqueta, String[] args) {
        // el script tarda unos ms: se pide una vez por ráfaga de tabulador, no en el hilo principal si se puede evitar
        String nombreOrden = orden.getName().toLowerCase(Locale.ROOT);
        if (nombreOrden.equals("bo")) { List<String> r = new ArrayList<>(); Bukkit.getOnlinePlayers().forEach(p -> r.add(p.getName())); return filtrar(r, args); }
        if (nombreOrden.equals("debo")) return filtrar(new ArrayList<>(operadores), args);
        String de = alcance(quien);
        if (de != null && de.isEmpty()) return new ArrayList<>();
        List<String> todos = new ArrayList<>(List.of("bots"));
        todos.addAll(ejecutar(de == null ? List.of("--listar") : List.of("--listar", "--de", de)));
        return filtrar(todos, args);
    }

    private static List<String> filtrar(List<String> todos, String[] args) {
        String prefijo = args[args.length - 1].toLowerCase(Locale.ROOT);
        todos.removeIf(n -> !n.toLowerCase(Locale.ROOT).startsWith(prefijo));
        return todos;
    }

    // ---- Rol «bot operator» ---------------------------------------------------------------------------------------------------
    // Con qué alcance puede usar /connect y /disconnect quien escribe: null = todos los bots (consola, op o somaconnect.use); el nombre del
    // jugador = solo los suyos (rol somaconnect.operator, que da /bo); "" = ninguno.
    private String alcance(CommandSender quien) {
        if (!(quien instanceof Player) || quien.hasPermission("somaconnect.use")) return null;
        return quien.hasPermission("somaconnect.operator") ? quien.getName() : "";
    }

    private boolean darOQuitarRol(CommandSender quien, boolean dar, String[] args) {
        if (args.length != 1 || !args[0].matches("[A-Za-z0-9_]{1,16}")) { quien.sendMessage("Uso: /" + (dar ? "bo" : "debo") + " <jugador>"); return true; }
        String clave = args[0].toLowerCase(Locale.ROOT);
        boolean cambio = dar ? operadores.add(clave) : operadores.remove(clave);
        if (cambio) guardarOperadores();
        Player p = Bukkit.getPlayerExact(args[0]);
        if (p != null) { aplicarRol(p); p.sendMessage(dar ? "Ahora eres bot operator: /connect y /disconnect con tus propios bots." : "Ya no eres bot operator."); }
        quien.sendMessage(args[0] + (dar ? (cambio ? " ahora es bot operator." : " ya era bot operator.") : (cambio ? " ya no es bot operator." : " no era bot operator.")));
        return true;
    }

    private void guardarOperadores() {
        try {
            YamlConfiguration y = new YamlConfiguration();
            y.set("operadores", new ArrayList<>(operadores));
            getDataFolder().mkdirs();
            y.save(ficheroOperadores);
        } catch (Exception e) {
            getLogger().warning("no puedo guardar " + ficheroOperadores + ": " + e.getMessage());
        }
    }

    // Pone o quita a un jugador el permiso somaconnect.operator según esté en la lista (también al entrar)
    private void aplicarRol(Player p) {
        PermissionAttachment previo = permisos.remove(p.getUniqueId());
        if (previo != null) { try { p.removeAttachment(previo); } catch (IllegalArgumentException ignorado) { } }
        if (operadores.contains(p.getName().toLowerCase(Locale.ROOT))) {
            PermissionAttachment a = p.addAttachment(this);
            a.setPermission("somaconnect.operator", true);
            permisos.put(p.getUniqueId(), a);
        }
        p.updateCommands();
    }

    @EventHandler
    public void alSalir(PlayerQuitEvent ev) {
        permisos.remove(ev.getPlayer().getUniqueId());
        if (duenos.remove(ev.getPlayer().getName()) != null) difundirDuenos();
    }

    // El brand lo pone el cliente, así que no es de fiar: del dueño solo se admiten letras, cifras y «_» (hasta 16, como un nombre de
    // Minecraft); con otra cosa cuenta como sin dueño. Así tampoco se cuela nada raro en el JSON.
    private static String limpiarDueno(String d) { return d != null && d.matches("[A-Za-z0-9_]{1,16}") ? d : ""; }

    // Manda a cada bot conectado el mapa completo dueño → bots (en minúsculas el dueño). Cada vez que entra o sale un bot.
    private void difundirDuenos() {
        Map<String, List<String>> porDueno = new TreeMap<>();
        for (Entry<String, String> e : duenos.entrySet())
            if (!e.getValue().isEmpty()) porDueno.computeIfAbsent(e.getValue().toLowerCase(Locale.ROOT), k -> new ArrayList<>()).add(e.getKey());
        StringBuilder sb = new StringBuilder("{");
        for (Entry<String, List<String>> e : porDueno.entrySet()) {
            if (sb.length() > 1) sb.append(',');
            sb.append('"').append(e.getKey()).append("\":[");
            for (int i = 0; i < e.getValue().size(); i++) sb.append(i > 0 ? "," : "").append('"').append(e.getValue().get(i)).append('"');
            sb.append(']');
        }
        byte[] datos = sb.append('}').toString().getBytes(StandardCharsets.UTF_8);
        for (String bot : duenos.keySet()) {
            Player p = Bukkit.getPlayerExact(bot);
            if (p != null) p.sendPluginMessage(this, CANAL, datos);
        }
        getLogger().info("canal " + CANAL + ": " + new String(datos, StandardCharsets.UTF_8));
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

    // «lanzador» del jugador en el plantel ("IP:puerto"), o null
    private String lanzadorDe(String jugador) {
        File[] fs = jugadores.listFiles((d, n) -> n.equalsIgnoreCase(jugador + ".json"));
        if (fs == null || fs.length == 0) return null;
        try {
            JsonElement l = JsonParser.parseString(java.nio.file.Files.readString(fs[0].toPath())).getAsJsonObject().get("lanzador");
            return l == null || l.isJsonNull() || l.getAsString().isBlank() ? null : l.getAsString();
        } catch (Exception e) { getLogger().warning("no puedo leer " + fs[0] + ": " + e.getMessage()); return null; }
    }

    private List<String> pedirALanzador(String lanzador, String clave, String jugador, List<String> nombres, boolean desconectar) {
        List<String> salida = new ArrayList<>();
        try {
            StringBuilder lista = new StringBuilder();
            for (String n : nombres) lista.append(lista.length() > 0 ? "," : "").append('"').append(n).append('"'); // ya validados: [A-Za-z0-9_]
            String cuerpo = "{\"jugador\":\"" + jugador + "\",\"nombres\":[" + lista + "],\"desconectar\":" + desconectar + "}";
            java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://" + lanzador + "/conectar"))
                .timeout(java.time.Duration.ofSeconds(40)).header("content-type", "application/json").header("x-clave", clave)
                .POST(java.net.http.HttpRequest.BodyPublishers.ofString(cuerpo)).build();
            java.net.http.HttpResponse<String> r = java.net.http.HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(5)).build()
                .send(req, java.net.http.HttpResponse.BodyHandlers.ofString());
            var o = JsonParser.parseString(r.body()).getAsJsonObject();
            if (o.has("lineas")) for (JsonElement e : o.getAsJsonArray("lineas")) salida.add(e.getAsString());
            else salida.add("Tu lanzador dice: " + (o.has("error") ? o.get("error").getAsString() : r.body()));
        } catch (Exception e) {
            salida.add("No llego a tu lanzador (" + lanzador + "): " + e.getMessage() + " — ¿make launcher-start en tu PC?");
        }
        return salida;
    }

    private Set<String> nombresDeBots() {
        Set<String> r = new HashSet<>();
        // 2026-11-02: los del plantel (todos los jugadores) y, de respaldo, los de personajes.json
        File[] fs = jugadores.listFiles((d, n) -> n.endsWith(".json") && !n.equalsIgnoreCase("EJEMPLO.json"));
        if (fs != null) for (File f : fs) {
            try {
                for (JsonElement e : JsonParser.parseString(java.nio.file.Files.readString(f.toPath())).getAsJsonObject().getAsJsonArray("bots"))
                    r.add(e.getAsJsonObject().get("nombre").getAsString());
            } catch (Exception e) { getLogger().warning("no puedo leer " + f + ": " + e.getMessage()); }
        }
        if (!personajes.exists()) return r;
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
        aplicarRol(p);
        Bukkit.getScheduler().runTask(this, () -> colorear(p)); // un tick después: el jugador ya está en el mundo
        Bukkit.getScheduler().runTaskLater(this, () -> mirarMarca(p, 1), 20L); // el brand llega al cabo de ~1 s
    }

    // El brand del cliente («soma-bot;dueno=NOMBRE», lo manda bot/io.js). Llega después de entrar: se mira a los 20 ticks y, si aún no está,
    // dos veces más (cada 4 s). Se apunta en la consola con su texto, para ver a quién se reconoce y de quién es.
    private void mirarMarca(Player p, int intento) {
        String brand = p.getClientBrandName();
        getLogger().info("brand de " + p.getName() + " (intento " + intento + "): " + (brand == null ? "aún no llegó" : "'" + brand + "'"));
        if (brand != null && brand.startsWith("soma-bot")) {
            String dueno = limpiarDueno(brand.contains("dueno=") ? brand.substring(brand.indexOf("dueno=") + 6) : "");
            duenos.put(p.getName(), dueno);
            difundirDuenos();
            getLogger().info("  → " + p.getName() + " es un bot, dueño: " + (dueno.isEmpty() ? "(ninguno)" : dueno));
            colorear(p, true);
        } else if (brand == null && intento < 2) {
            Bukkit.getScheduler().runTaskLater(this, () -> mirarMarca(p, intento + 1), 80L);
        }
    }

    private void colorear(Player p) { colorear(p, false); }

    private void colorear(Player p, boolean porMarca) {
        if (!porMarca && !nombresDeBots().contains(p.getName())) return;
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
