require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

let messages = [];
let lastMessageId = null;
let channel = null;
let afterDate = null;
const reactionCountCache = {}; // { messageId: { count: number, link: string } }
const REQUIRED_ROLE = 'Admins'; // Replace with the required role name or ID


client.on('ready', async (e) => {
  console.log(`${e.user.tag} is ready!`);
});

client.on('messageCreate', (message) => {
  if (message.author.bot || !message.content.startsWith('!!!')) return;

  if (message.content === '!!!ping') {
    message.reply('pong');
    return;
  }

  if (!hasRequiredRole(message)) {
    message.reply('You do not have permission to use this command.');
    return;
  }

  if (message.content.startsWith('!!!setdate')) {
    setDate(message);
  } else if (message.content.startsWith('!!!setchannel')) {
    setChannel(message);
  } else if (message.content.startsWith('!!!load')) {
    loadMessages(message);
  } else if (message.content.startsWith('!!!count')) {
    getReactionCount(message);
  } else if (message.content.startsWith('!!!messages')) {
    getMessagesWithLinks(message);
  } else if (message.content.startsWith('!!!')) {
    message.channel.send('Invalid command');
  }
});

function hasRequiredRole(message) {
  const member = message.member;
  if (!member) return false;

  const requiredRole = message.guild.roles.cache.find(
    (role) => role.name === REQUIRED_ROLE || role.id === REQUIRED_ROLE
  );

  if (!requiredRole) {
    console.error(`Role "${REQUIRED_ROLE}" not found in the server.`);
    return false;
  }

  // Check if the user has the required role or any higher role
  return member.roles.cache.some((role) => role.position >= requiredRole.position);
}


function cacheReactions(fetchedMessages) {
  fetchedMessages.forEach((message) => {
    if (!reactionCountCache[message.id]) {
      const mostReacted = message.reactions.cache.reduce(
        (max, reaction) => (reaction.count > max.count ? reaction : max),
        { count: 0 }
      );
      reactionCountCache[message.id] = {
        count: mostReacted.count || 0,
        link: message.url,
      };
    }
  });
}

async function loadMessages(message) {
  try {
    console.time('loadMessages');
    let keepFetching = true;

    while (keepFetching) {
      const fetchedMessages = await channel.messages.fetch({ limit: 100, before: lastMessageId, cache: true });
      if (fetchedMessages.size === 0) break;

      const filteredMessages = fetchedMessages.filter((msg) => msg.createdTimestamp > afterDate.getTime());
      messages = messages.concat(Array.from(filteredMessages.values()));
      cacheReactions(filteredMessages);

      lastMessageId = fetchedMessages.last().id;

      if (fetchedMessages.last().createdTimestamp <= afterDate.getTime()) {
        keepFetching = false;
      }
    }

    console.timeEnd('loadMessages');
    message.channel.send(`Fetched ${messages.length} messages after ${afterDate}`);
  } catch (error) {
    console.error(error);
    message.channel.send('Failed to load messages, ping Singh');
  }
}

async function getReactionCount(message) {
  if (afterDate === null) {
    message.channel.send('Set date first');
    return;
  } else if (messages.length === 0) {
    message.channel.send('Load messages first');
    return;
  }
  try {
    const count = parseInt(extract(message));
    const filteredMessages = messages.filter((msg) => reactionCountCache[msg.id].count >= count);

    message.channel.send(`Found total of ${filteredMessages.length} messages with at least ${count} reactions.`);
  } catch (error) {
    console.error(error);
    message.channel.send('Failed to get reaction count, ping Singh');
  }
}

async function getMessagesWithLinks(message) {
  if (messages.length === 0) {
    message.channel.send('Load messages first');
    return;
  }
  try {
    const count = parseInt(extract(message));
    const filteredMessages = messages
      .filter((msg) => reactionCountCache[msg.id].count >= count)
      .map((msg, index) => `${index + 1}. ${reactionCountCache[msg.id].link}`);

    if (filteredMessages.length === 0) {
      message.channel.send(`No messages found with reactions greater than or equal to ${count}.`);
    } else {
      for (let i = 0; i < filteredMessages.length; i += 20) {
        const chunk = filteredMessages.slice(i, i + 20).join('\n');
        await message.channel.send(chunk);
      }
    }
  } catch (error) {
    console.error(error);
    message.channel.send('Failed to get messages with links, ping Singh');
  }
}

async function setDate(message) {
  try {
    const date = new Date(extract(message));
    afterDate = date;
    message.channel.send(`Set date to ${date}`);
  } catch {
    message.channel.send('Invalid date format, use YYYY-MM-DD');
  }
}

async function setChannel(message) {
  try {
    const channelId = extract(message);
    channel = await client.channels.fetch(channelId);
    message.channel.send(`Set channel to ${channel.name}`);
  } catch {
    message.channel.send('Invalid channel ID');
  }
}

function extract(message) {
  return message.content.split(' ')[1];
}

client.login(process.env.TOKEN);
