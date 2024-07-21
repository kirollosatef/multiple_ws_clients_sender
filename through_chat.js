const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const xlsx = require("xlsx");
const fs = require("fs").promises;
const path = require("path");

let clients = [];
let excelFiles = [];
let txtFiles = [];
let excelFirstRow = [];
let isPaused = false;
let isStarted = false;
let isStopped = false;
let isReady = false;
let allDatabaseData = [];
let delay;
let messageContent;
let noWhatsappNumbers = [];
let file2send;
let excelFilesMessage = "";
let txtFilesMessage = "";
let textFileNumber;
let totalTime;
let totalUsers;

async function main() {
  console.log("Starting main function");
  try {
    console.log("Loading config...");
    const config = await loadConfig();
    console.log("Config loaded successfully");

    console.log("Loading no WhatsApp numbers...");
    noWhatsappNumbers = await loadNoWhatsappNumbers();
    console.log("No WhatsApp numbers loaded successfully");

    console.log("Reading directories...");
    const databasesFolder = await fs.readdir("./databases");
    const messagesFolder = await fs.readdir("./messageTemplates");
    console.log("Directories read successfully");

    excelFiles = databasesFolder.filter(file => path.extname(file).toLowerCase() === ".xlsx");
    txtFiles = messagesFolder.filter(file => path.extname(file).toLowerCase() === ".txt");

    console.log("Initializing controller...");
    const controller = await initializeController(config);
    console.log("Controller initialized successfully");
    clients.push(controller);

    controller.on("ready", () => handleControllerReady(controller, config));
    controller.on("message_create", (message) => handleMessage(message, config));

    await initializeAdditionalClients(config);
  } catch (err) {
    console.error("An error occurred:", err);
    await fs.writeFile("logs.txt", err.toString());
  }
}

async function loadConfig() {
  console.log("Inside loadConfig function");
  const configPath = "./config.json";
  try {
    const configData = await fs.readFile(configPath, "utf8");
    console.log("Config file read successfully");
    return JSON.parse(configData);
  } catch (err) {
    console.error("Error loading config:", err);
    throw err;
  }
}

async function loadNoWhatsappNumbers() {
  try {
    const data = await fs.readFile("./no-whatsapp-numbers.txt", "utf8");
    return data.split(/\r?\n/);
  } catch (err) {
    console.error("Error loading no-whatsapp numbers:", err);
    return [];
  }
}

async function initializeController(config) {
  console.log("Starting controller initialization...");
  const controller = new Client({
    authStrategy: new LocalAuth({ clientId: "client-1" }),
    puppeteer: {
      executablePath: config.chromePath,
      args: [
        "--hide-crash-restore-bubble",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-web-security",
        "--disable-site-isolation-trials"
      ],
      headless: false,
    },
    webVersionCache: {
      type: 'none'
    }
  });

  controller.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
  });

  controller.on('authenticated', () => {
    console.log('AUTHENTICATED');
  });

  controller.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
  });

  console.log("Client instance created, starting initialization...");
  try {
    console.log("Initializing controller...");
    await controller.initialize();
    console.log("Controller initialized successfully");
    return controller;
  } catch (error) {
    console.error("Error during controller initialization:", error);
    throw error;
  }
}

async function handleControllerReady(controller, config) {
  console.log("client-1 is ready!");
  isReady = true;

  if (await isLicensed(controller, config)) {
    await sendMenu(controller);
  } else {
    console.log("[!] This number is not licensed, the program will close");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await controller.destroy();
    process.exit(1);
  }
}

async function isLicensed(controller, config) {
  return config.licensedNumbers.includes(controller.info.wid.user);
}

async function sendMenu(controller) {
  const menu = `1- ارسال رسائل جديدة
2- ايقاف مؤقت
3- استكمال بعد ايقاف مؤقت
4- ايقاف الارسال تماماً
5- استكمال عملية ارسال متوقفة

ارسل @ لاظهار القائمة مرة اخري`;

  await controller.sendMessage(controller.info.wid._serialized, menu);
}

async function handleMessage(message, config) {
  if (message.from !== message.to) return;

  if (message.body === "@") {
    await sendMenu(message.client);
    return;
  }

  const quotedMessage = await message.getQuotedMessage();
  if (!quotedMessage) return;

  if (quotedMessage.body.includes("جديدة") && message.body === "1") {
    await handleNewMessages(message.client);
  } else if (quotedMessage.body.includes("ايقاف مؤقت") && message.body === "2") {
    isPaused = true;
  } else if (quotedMessage.body.includes("استكمال بعد ايقاف مؤقت") && message.body === "3") {
    isPaused = false;
  } else if (quotedMessage.body.includes("ايقاف الارسال تماماً") && message.body === "4") {
    isStopped = true;
  } else if (quotedMessage.body.includes("استكمال عملية ارسال متوقفة") && message.body === "5") {
    await resumeSendingProcess(message.client);
  } else if (quotedMessage.body.includes("xlsx")) {
    await handleExcelSelection(message);
  } else if (quotedMessage.body.includes("txt")) {
    await handleMessageTemplateSelection(message);
  } else if (quotedMessage.body.includes("عدد ارقام الواتساب الاضافية:")) {
    await handleAdditionalClientsSetup(message);
  } else if (quotedMessage.body.includes("مدة التأخير بالثواني:")) {
    await handleDelaySetup(message);
  }
}

async function handleNewMessages(client) {
  isStarted = true;
  excelFilesMessage = "";
  txtFilesMessage = "";
  await client.sendMessage(client.info.wid._serialized, "اختر ملف الاكسيل:");

  excelFiles.forEach((file, index) => {
    excelFilesMessage += `${index + 1}- ${file}\n`;
  });

  await client.sendMessage(client.info.wid._serialized, excelFilesMessage);
}

async function handleExcelSelection(message) {
  const excelFileNumber = message.body;
  allDatabaseData = [];

  if (excelFileNumber.includes(",")) {
    const excelFilesNumbers = excelFileNumber.split(",");
    for (let excelFileNum of excelFilesNumbers) {
      const data = await readExcelFile(excelFiles[excelFileNum - 1]);
      allDatabaseData = allDatabaseData.concat(data);
    }
  } else {
    const data = await readExcelFile(excelFiles[excelFileNumber - 1]);
    allDatabaseData = allDatabaseData.concat(data);
  }

  excelFirstRow = Object.keys(allDatabaseData[0]).filter(key => key !== "clientNum");

  await message.client.sendMessage(message.client.info.wid._serialized, "اختر قالب الرسالة: ");

  txtFiles.forEach((file, index) => {
    txtFilesMessage += `${index + 1}- ${file}\n`;
  });

  await message.client.sendMessage(message.client.info.wid._serialized, txtFilesMessage);
}

async function readExcelFile(fileName) {
  const workbook = xlsx.readFile(`./databases/${fileName}`);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(worksheet);
}

async function handleMessageTemplateSelection(message) {
  textFileNumber = message.body;
  messageContent = await fs.readFile(`./messageTemplates/${txtFiles[textFileNumber - 1]}`, "utf8");

  await updateDatabase({ message: messageContent });

  await message.client.sendMessage(message.client.info.wid._serialized, "عدد ارقام الواتساب الاضافية:");
}

async function handleAdditionalClientsSetup(message) {
  const whatsappClients = Number(message.body);

  allDatabaseData = allDatabaseData.map((rowObj, index) => ({
    ...rowObj,
    clientNum: (index % (whatsappClients + 1)) + 1
  }));

  await updateDatabase({
    no_clients: whatsappClients + 1,
    users: allDatabaseData
  });

  totalUsers = allDatabaseData.length;

  await message.client.sendMessage(message.client.info.wid._serialized, "مدة التأخير بالثواني:");
}

async function handleDelaySetup(message) {
  delay = Number(message.body);

  await updateDatabase({ delay: delay });

  totalTime = delay * allDatabaseData.length - 1;

  if (isReady) {
    for (let client of clients) {
      sendMessage(client);
    }
  } else {
    await initializeAdditionalClients({ additionalClients: clients.length - 1 });
  }
}

async function resumeSendingProcess(client) {
  const database = await loadDatabase();
  allDatabaseData = database.users;
  messageContent = database.message;
  totalTime = database.delay * database.users.length - 1;

  excelFirstRow = Object.keys(allDatabaseData[0]).filter(key => key !== "clientNum");

  isStopped = false;
  if (isReady) {
    for (let client of clients) {
      sendMessage(client);
    }
  } else {
    await initializeAdditionalClients({ additionalClients: database.no_clients - 1 });
  }
}

async function initializeAdditionalClients(config) {
  for (let i = 2; i <= config.additionalClients + 1; i++) {
    const client = await createClient(`client-${i}`, config);
    clients.push(client);
  }
}

async function createClient(clientId, config) {
  const client = new Client({
    authStrategy: new LocalAuth({ clientId }),
    puppeteer: {
      executablePath: config.chromePath,
      args: ["--hide-crash-restore-bubble"],
      headless: false,
    },
  });

  await client.initialize();
  console.log(`${clientId} is ready!`);

  client.on("message", (message) => appendMessageToExcel(message));

  return client;
}

async function sendMessage(client) {
  try {
    const database = await loadDatabase();
    messageContent = database.message;

    for (let rowNumber = database[client.authStrategy.clientId] || 0; rowNumber < database.users.length; rowNumber++) {
      while (isPaused) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (isStopped) return;

      let rowObj = database.users[rowNumber];

      if (`client-${rowObj.clientNum}` === client.authStrategy.clientId) {
        if (await client.isRegisteredUser(`${rowObj.number}@c.us`)) {
          progressBar(allDatabaseData.length, rowNumber, client);

          let currentMessageContent = messageContent;
          for (let key of excelFirstRow) {
            currentMessageContent = currentMessageContent.replace(`<${key}>`, rowObj[key]);
          }

          if (rowObj.attach) {
            const attachmentFolder = await fs.readdir(".\\attachment");
            file2send = attachmentFolder.find(file => file.includes(rowObj.attach));

            if (file2send) {
              const media = MessageMedia.fromFilePath(`.\\attachment\\${file2send}`);
              await client.sendMessage(`${rowObj.number}@c.us`, media, { caption: currentMessageContent });
            }
          } else {
            await client.sendMessage(`${rowObj.number}@c.us`, currentMessageContent);
          }

          totalTime -= database.delay;

          await updateDatabase({ [client.authStrategy.clientId]: rowNumber + 1 });

          await new Promise((resolve) => setTimeout(resolve, database.delay * 1000));
        } else {
          noWhatsappNumbers.push(rowObj.number);
          await fs.writeFile("./no-whatsapp-numbers.txt", noWhatsappNumbers.join("\n"));
        }

        if (rowNumber === database.users.length - 1) {
          await client.sendMessage(client.info.wid._serialized, `✅ تم الارسال`);
          await resetDatabase();
        }
      }
    }

    progressBar(totalUsers, totalUsers, client);
  } catch (error) {
    console.error("Error in sending messages:", error);
  }
}

async function loadDatabase() {
  const data = await fs.readFile("./database.json", "utf8");
  return JSON.parse(data);
}

async function updateDatabase(updates) {
  const database = await loadDatabase();
  Object.assign(database, updates);
  await fs.writeFile("./database.json", JSON.stringify(database, null, 2));
}

async function resetDatabase() {
  const resetData = {
    message: "",
    no_clients: 0,
    delay: 0,
    users: []
  };

  for (let client of clients) {
    resetData[client.authStrategy.clientId] = 0;
  }

  await updateDatabase(resetData);

  totalTime = 0;
  allDatabaseData = [];
  excelFirstRow = [];
  messageContent = "";
}

function progressBar(total, current, client) {
  const width = 40;
  const percentage = (current / total) * 100;
  const progress = Math.round((width * current) / total);
  const bar = "█".repeat(progress) + "-".repeat(width - progress);

  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write(
    `${client.authStrategy.clientId} progress: [${bar}] ${percentage.toFixed(2)}% ${convertSecondsToTime(
      totalTime
    )}`
  );

  if (current === total) {
    process.stdout.write("\n\n# sending finished #");
  }
}

function convertSecondsToTime(seconds) {
  if (isNaN(seconds) || seconds < 0) {
    return "#Sending Finished#";
  }

  const days = Math.floor(seconds / (24 * 3600));
  const hours = Math.floor((seconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const result = [];
  if (days > 0) result.push(`${days} day`);
  if (hours > 0) result.push(`${hours} hour`);
  if (minutes > 0) result.push(`${minutes} minutes`);
  if (remainingSeconds > 0) result.push(`${remainingSeconds} seconds`);

  return result.join(", ");
}

async function appendMessageToExcel(message) {
  if (message.type === "chat" && message.from.length < 18) {
    try {
      const workbook = xlsx.readFile("users_messages.xlsx");
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const range = xlsx.utils.decode_range(worksheet["!ref"]);

      const phoneNumber = message.from.replace("@c.us", "");
      let valueFound = false;

      for (let R = range.s.r; R <= range.e.r; ++R) {
        const cellAddress = xlsx.utils.encode_cell({ r: R, c: range.s.c });
        let cellValue = worksheet[cellAddress] ? worksheet[cellAddress].v : null;

        if (cellValue == phoneNumber) {
          const nextColumnAddress = xlsx.utils.encode_cell({ r: R, c: range.s.c + 1 });
          worksheet[nextColumnAddress] = {
            v: message.body + "\n" + "-".repeat(10) + "\n" + (worksheet[nextColumnAddress]?.v || ""),
          };
          valueFound = true;
          break;
        }
      }

      if (!valueFound) {
        const newRow = range.e.r + 1;
        const targetCellAddress = xlsx.utils.encode_cell({ r: newRow, c: range.s.c });
        worksheet[targetCellAddress] = { v: phoneNumber };

        const nextColumnAddress = xlsx.utils.encode_cell({ r: newRow, c: range.s.c + 1 });
        worksheet[nextColumnAddress] = { v: message.body };

        worksheet["!ref"] = xlsx.utils.encode_range({
          s: range.s,
          e: { r: newRow, c: range.e.c },
        });
      }

      xlsx.writeFile(workbook, "users_messages.xlsx");
    } catch (error) {
      console.error("Error appending message to Excel:", error);
    }
  }
}

main().catch((error) => {
  console.error("Unhandled error in main function:", error);
  fs.writeFile("logs.txt", error.toString()).catch(console.error);
});