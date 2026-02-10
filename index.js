import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";
import PlayFab from "playfab-sdk";
import express from "express";

PlayFab.settings.titleId = process.env.PLAYFAB_TITLE_ID;
PlayFab.settings.developerSecretKey = process.env.PLAYFAB_SECRET_KEY;

const app = express();
app.listen(process.env.PORT || 3000);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your game account")
    .addStringOption(o =>
      o.setName("code").setRequired(true)
    )
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  await i.deferReply();

  let finished = false;
  const timeout = setTimeout(() => {
    if (!finished) i.editReply("❌ Request timed out.");
  }, 2500);

  PlayFab.Server.ExecuteCloudScript({
    FunctionName: "LinkDiscordAccount",
    FunctionParameter: {
      code: i.options.getString("code"),
      discordId: i.user.id
    }
  }, res => {
    finished = true;
    clearTimeout(timeout);

    if (res?.FunctionResult?.success) {
      i.editReply(`✅ ${i.user} linked successfully!`);
    } else {
      i.editReply(`❌ ${res?.FunctionResult?.message || "Failed"}`);
    }
  });
});

client.login(process.env.DISCORD_TOKEN);
