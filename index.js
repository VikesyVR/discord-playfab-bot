import "dotenv/config";
import express from "express";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";
import PlayFab from "playfab-sdk";

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
      o.setName("code").setDescription("Code from game").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim daily reward")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  // 🔗 LINK
  if (i.commandName === "link") {
    await i.deferReply();

    let finished = false;
    const timeout = setTimeout(() => {
      if (!finished) i.editReply("❌ Linking timed out. Try again.");
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
        i.editReply(`✅ ${i.user} your Discord is now linked!`);
      } else {
        i.editReply(`❌ ${res?.FunctionResult?.message || "Link failed"}`);
      }
    });
  }

  // 🎁 DAILY
  if (i.commandName === "daily") {
    await i.deferReply();

    PlayFab.Server.ExecuteCloudScript({
      FunctionName: "DailyReward",
      FunctionParameter: {
        playFabId: i.user.id // resolved via linked DiscordId
      }
    }, res => {
      const r = res.FunctionResult;

      if (!r.success) {
        const mins = Math.ceil(r.remainingMs / 60000);
        i.editReply(`⏳ ${i.user} come back in **${mins} minutes**`);
      } else {
        i.editReply(`🎉 ${i.user} received **${r.reward} PP**!`);
      }
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
