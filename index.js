import "dotenv/config";
import express from "express";
import axios from "axios";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

/* ===============================
   KEEP ALIVE (Railway)
================================ */
const app = express();
app.get("/", (_, res) => res.send("OK"));
app.listen(process.env.PORT || 3000);

/* ===============================
   DISCORD CLIENT
================================ */
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ===============================
   SLASH COMMANDS
================================ */
const commands = [
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your game account to Discord")
    .addStringOption(o =>
      o.setName("code")
        .setDescription("The code shown in-game")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily reward")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

await rest.put(
  Routes.applicationCommands(process.env.CLIENT_ID),
  { body: commands }
);

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

/* ===============================
   EXECUTE CLOUDSCRIPT
================================ */
async function callCloudScript(functionName, params) {
  try {
    const response = await axios.post(
      `https://${process.env.PLAYFAB_TITLE_ID}.playfabapi.com/Server/ExecuteCloudScript`,
      {
        FunctionName: functionName,
        FunctionParameter: params
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-SecretKey": process.env.PLAYFAB_SECRET_KEY
        }
      }
    );

    return response.data.data.FunctionResult;

  } catch (err) {
    console.error("CloudScript error:",
      err.response?.data || err.message
    );
    return null;
  }
}

/* ===============================
   ADMIN GRANT CURRENCY
================================ */
async function grantCurrency(playFabId, amount) {
  try {
    await axios.post(
      `https://${process.env.PLAYFAB_TITLE_ID}.playfabapi.com/Admin/AddUserVirtualCurrency`,
      {
        PlayFabId: playFabId,
        VirtualCurrency: "PP",
        Amount: amount
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-SecretKey": process.env.PLAYFAB_SECRET_KEY
        }
      }
    );
    return true;
  } catch (err) {
    console.error("Admin error:",
      err.response?.data || err.message
    );
    return false;
  }
}

/* ===============================
   INTERACTIONS
================================ */
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // LINK COMMAND
  if (interaction.commandName === "link") {

    await interaction.reply("🔗 Linking your account...");

    const result = await callCloudScript("LinkDiscordAccount", {
      code: interaction.options.getString("code"),
      discordId: interaction.user.id
    });

    if (!result)
      return interaction.editReply("❌ PlayFab error.");

    if (result.success)
      return interaction.editReply(
        `✅ ${interaction.user} linked successfully!`
      );

    return interaction.editReply(
      `❌ ${result.message}`
    );
  }

  // DAILY COMMAND
  if (interaction.commandName === "daily") {

    await interaction.reply("🎁 Checking your daily reward...");

    const result = await callCloudScript("ResolveDaily", {
      discordId: interaction.user.id
    });

    if (!result)
      return interaction.editReply("❌ PlayFab error.");

    if (!result.success) {

      if (result.remainingMs) {
        const mins = Math.ceil(result.remainingMs / 60000);
        return interaction.editReply(
          `⏳ ${interaction.user} come back in **${mins} minutes**`
        );
      }

      return interaction.editReply("❌ You must link first.");
    }

    const granted = await grantCurrency(result.playFabId, 100);

    if (!granted)
      return interaction.editReply("❌ Currency grant failed.");

    return interaction.editReply(
      `🎉 ${interaction.user} received **100 PP**!`
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
