const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
try {
  let whatsappClients;
  let excelFiles = [];
  let txtFiles = [];
  let excelFirstRow = [];
  let clients = [];
  let isPaused = false;
  let isStarted = false;
  let isStopped = false;
  let isReady = false;
  let databaseWorkBook;
  let databaseWorkSheet;
  let databaseData;
  let allDatabaseData = [];
  let delay;
  let messageContent;
  let noWhatsappNumbers = [];
  let file2send;
  let excelFilesMessage = "";
  let txtFilesMessage = "";
  let textFileNumber;
  let totalTime;
  let jsonContent;
  let josnObject;
  let result;
  let totalUsers;
  let allowedMachines = [];
  let usersWorkBook;
  let usersWorkSheet;
  let users_data;
  let passwordIsCorrect = false;
  let isNumberLicensed;

  const databasesFolder = fs.readdirSync("./databases");
  const messagesFolder = fs.readdirSync("./messageTemplates");

  noWhatsappNumbers = fs.readFileSync("./no-whatsapp-numbers.txt", "utf8").split(/\r?\n/);

  let licensedNumbers = [
    966507142602, 966126966802, 966530533253, 966920035162, 966126582733, 966126966702, 966561013374,
    966541669021, 966543163911, 966569850344, 966547628401, 966564625057, 966545167677, 966562330858,
    966562337075, 966561146024, 966562336626, 966569477515, 966568099577, 966560779446, 966544877218,
    966545167677, 966561776010, 966569477247, 966546450773, 966562331983, 966562335025, 966561148201,
    966561146539, 966561146357, 966561153436, 966562334037, 966561145035, 966569477994, 966547714828,
    966562332939, 966561153262, 966562330738, 966561148564, 966562329116, 966561153186, 966506047404,
    201123780247, 201021382736, 201032892585, 966126612947, 966126966712, 9660126966722, 966126966723,
    966126966727, 966126966749, 966126966753, 966126966758, 966126966769, 966126966770, 966126966783,
    966126966967, 966126966769, 966126966722,
  ];

  function appendMessageToExcel(message) {
    if (message.type == "chat" && message.from.length < 18) {
      // console.log(message)

      let usersWorkBook = xlsx.readFile("users_messages.xlsx");
      let usersWorkSheet = usersWorkBook.Sheets[usersWorkBook.SheetNames[0]];
      // let users_data = xlsx.utils.sheet_to_json(usersWorkSheet);
      let range = xlsx.utils.decode_range(usersWorkSheet["!ref"]);
      let valueFound = false;

      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          // Build the cell address
          const cellAddress = xlsx.utils.encode_cell({ r: R, c: C });

          // Get the cell value
          let cellValue = usersWorkSheet[cellAddress] ? usersWorkSheet[cellAddress].v : null;

          // Check if the cell value matches the target value
          if (cellValue == message.from.replace("@c.us", "")) {
            const nextColumnAddress = xlsx.utils.encode_cell({ r: R, c: C + 1 });
            usersWorkSheet[nextColumnAddress] = {
              v: message.body + "\n" + "-".repeat(10) + "\n" + usersWorkSheet[nextColumnAddress].v,
            };
            valueFound = true;
            break;
          }
        }
      }

      if (!valueFound) {
        const newRow = range.e.r + 1;

        // Set the target value in the first column
        const targetCellAddress = xlsx.utils.encode_cell({ r: newRow, c: range.s.c });
        usersWorkSheet[targetCellAddress] = { v: message.from.replace("@c.us", "") };

        // Set the value in the next column (to the right) to 'found'
        const nextColumnAddress = xlsx.utils.encode_cell({ r: newRow, c: range.s.c + 1 });
        usersWorkSheet[nextColumnAddress] = { v: message.body };

        // Update the range to include the new row
        usersWorkSheet["!ref"] = xlsx.utils.encode_range({ s: range.s, e: { r: newRow, c: range.e.c + 1 } });

        // Save the changes back to the Excel file
      }

      xlsx.writeFile(usersWorkBook, "users_messages.xlsx");
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

  function progressBar(total, current, client) {
    const width = 40; // Width of the progress bar
    const percentage = (current / total) * 100;
    const progress = Math.round((width * current) / total);
    const bar = "█".repeat(progress) + "-".repeat(width - progress);

    process.stdout.clearLine(); // Clear the console line
    process.stdout.cursorTo(0); // Move the cursor to the beginning of the line
    process.stdout.write(
      `${client.authStrategy.clientId} progress: [${bar}] ${percentage.toFixed(2)}% ${convertSecondsToTime(
        totalTime
      )}`
    );

    if (current === total) {
      process.stdout.write("\n\n# sending finished #"); // Move to the next line when the progress is complete
    }
  }

  async function createClient(session) {
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: session }),
      puppeteer: {
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        args: ["--hide-crash-restore-bubble"],
        headless: false,
      },
    });

    client.on("ready", () => {
      console.log(`${client.authStrategy.clientId} is ready!`);
      isReady = true;
    });

    await client.initialize();
    return client;
  }

  async function sendMessage(client) {
    try {
      jsonContent = fs.readFileSync("./database.json");
      josnObject = JSON.parse(jsonContent);

      messageContent = josnObject["message"];

      for (
        let rowNumber = josnObject[`${client.authStrategy.clientId}`];
        rowNumber < josnObject["users"].length;
        rowNumber++
      ) {
        messageContent = josnObject["message"];

        while (isPaused == true) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        if (isStopped == true) {
          return;
        }

        let rowObj = josnObject["users"][rowNumber]; // rowNumber reprasent the index of user in users array
        let keys = Object.keys(rowObj);

        if (`client-${rowObj.clientNum}` == client.authStrategy.clientId) {
          if ((await client.isRegisteredUser(`${rowObj[keys[0]]}@c.us`)) == true) {
            progressBar(allDatabaseData.length, rowNumber, client);

            for (let i = 0; i < excelFirstRow.length; i++) {
              messageContent = messageContent.replace(`<${excelFirstRow[i]}>`, rowObj[keys[i + 1]]);
            }

            if (rowObj["attach"] !== undefined) {
              // console.log(rowObj["attach"])

              const attachmentFolder = fs.readdirSync(".\\attachment");

              for (let file of attachmentFolder) {
                if (file.includes(rowObj["attach"])) {
                  file2send = file;
                  break;
                }
              }

              const media = MessageMedia.fromFilePath(`.\\attachment\\${file2send}`);
              client.sendMessage(`${rowObj["number"]}@c.us`, media, { caption: messageContent });

              messageContent = josnObject["message"];
            } else if (rowObj["attach"] === undefined) {
              client.sendMessage(`${rowObj["number"]}@c.us`, messageContent);
              messageContent = josnObject["message"];
            }

            messageContent = josnObject["message"];

            totalTime -= josnObject["delay"];

            jsonContent = fs.readFileSync("./database.json");
            josnObject = JSON.parse(jsonContent);
            josnObject[client.authStrategy.clientId] = rowNumber + 1;

            fs.writeFileSync("./database.json", JSON.stringify(josnObject));

            await new Promise((resolve) => setTimeout(resolve, josnObject["delay"] * 1000));
          } else {
            messageContent = josnObject["message"];

            noWhatsappNumbers.push(rowObj[keys[0]]);

            const stream = fs.createWriteStream("./no-whatsapp-numbers.txt");

            noWhatsappNumbers.forEach((line) => {
              stream.write(`${line}\n`);
            });

            stream.end();

            continue;
          }

          if (rowNumber == josnObject["users"].length - 1) {
            controller.sendMessage(controller.info.wid._serialized, `✅ تم الارسال`);

            totalTime = 0;
            for (let client of clients) {
              josnObject[client.authStrategy.clientId] = 0;
            }
            josnObject["users"] = [];
            josnObject["message"] = "";
            josnObject["no_clients"] = 0;
            josnObject["delay"] = 0;
            allDatabaseData = [];
            excelFirstRow = [];
            messageContent = "";

            fs.writeFileSync("./database.json", JSON.stringify(josnObject));
          }
        }
      }

      progressBar(totalUsers, totalUsers, client);
    } catch {}
  }

  async function createClients(count) {
    for (let i = 1; i <= count; i++) {
      const client = await createClient(`client-${i + 1}`);

      jsonContent = fs.readFileSync("./database.json");
      jsonContent = JSON.parse(jsonContent);

      if (!josnObject[client.authStrategy.clientId]) {
        josnObject[client.authStrategy.clientId] = 0;
        fs.writeFileSync("./database.json", JSON.stringify(josnObject));
      }

      clients.push(client);
    }

    allDatabaseData = josnObject["users"];

    controller.sendMessage(
      controller.info.wid._serialized,
      `remaining time to send to  ${allDatabaseData.length} numbers is ${convertSecondsToTime(totalTime)}`
    );
    try {
      clients.forEach((client) => sendMessage(client));
      clients.forEach((client) =>
        client.on("message", (meseage) => {
          appendMessageToExcel(meseage);
        })
      );
    } catch {}
  }

  for (let file of databasesFolder) {
    if (path.extname(file).toLowerCase() === ".xlsx") {
      excelFiles.push(file);
    }
  }

  for (let file of messagesFolder) {
    if (path.extname(file).toLowerCase() === ".txt") {
      txtFiles.push(file);
    }
  }

  const controller = new Client({
    authStrategy: new LocalAuth({ clientId: "client-1" }),
    puppeteer: {
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: ["--hide-crash-restore-bubble"],
      headless: false,
    },
  });

  jsonContent = fs.readFileSync("./database.json");
  josnObject = JSON.parse(jsonContent);
  if (!josnObject["client-1"]) {
    josnObject["client-1"] = 0;
  }
  fs.writeFileSync("./database.json", JSON.stringify(josnObject));

  clients.push(controller);

  controller.initialize();

  controller.on("ready", async (message) => {
    console.log("client-1 is ready !");

    for (let licensedNumber of licensedNumbers) {
      if (licensedNumber == controller.info.wid.user) {
        isNumberLicensed = true;
        break;
      }
    }

    if (isNumberLicensed == true) {
      controller.sendMessage(
        controller.info.wid._serialized,
        `1- ارسال رسائل جديدة

2- ايقاف مؤقت

3- استكمال بعد ايقاف مؤقت

4- ايقاف الارسال تماماً

5- استكمال عملية ارسال متوقفة

ارسل @ لاظهار القائمة مرة اخري
            `
      );
    } else {
      console.log("[!] This number not licensed, the program will close");
      await new Promise((resolve) => setTimeout(resolve, 5000));

      controller.destroy();
    }
  });

  controller.on("message_create", async (message) => {
    if (message.from == message.to) {
      if (message.body == "@") {
        controller.sendMessage(
          controller.info.wid._serialized,
          `1- ارسال رسائل جديدة
    
2- ايقاف مؤقت

3- استكمال بعد ايقاف مؤقت

4- ايقاف الارسال تماماً

5- استكمال عملية ارسال متوقفة

ارسل @ لاظهار القائمة مرة اخري
                `
        );
      }

      let replyedMessage = await message.getQuotedMessage();

      if (replyedMessage) {
        if (replyedMessage.body.includes("جديدة") && message.body == "1") {
          isStarted = true;

          excelFilesMessage = "";
          txtFilesMessage = "";
          controller.sendMessage(controller.info.wid._serialized, "اختر ملف الاكسيل:");

          for (let excelFile of excelFiles) {
            excelFilesMessage = excelFilesMessage.concat(
              `${excelFiles.indexOf(excelFile) + 1}- ${excelFile}\n`
            );
          }
          excelFilesSentMessage = await controller.sendMessage(
            controller.info.wid._serialized,
            excelFilesMessage
          );
        } else if (replyedMessage.body.includes("ايقاف مؤقت") && message.body == "2") {
          isPaused = true;
        } else if (replyedMessage.body.includes("استكمال بعد ايقاف مؤقت") && message.body == "3") {
          isPaused = false;
        } else if (replyedMessage.body.includes("ايقاف الارسال تماماً") && message.body == "4") {
          isStopped = true;
        } else if (replyedMessage.body.includes("استكمال عملية ارسال متوقفة") && message.body == "5") {
          jsonContent = fs.readFileSync("./database.json");
          josnObject = JSON.parse(jsonContent);
          allDatabaseData = josnObject["users"];
          messageContent = josnObject["message"];
          totalTime = josnObject["delay"] * josnObject["users"].length - 1;

          for (let rowObj of allDatabaseData) {
            let keys = Object.keys(rowObj);
            keys.forEach((key) => {
              //   console.log(key);
              excelFirstRow.push(key);
            });

            break;
          }

          excelFirstRow.shift();

          isStopped = false;
          if (isReady == true) {
            clients.forEach((client) => sendMessage(client));
            clients.forEach((client) =>
              client.on("message", (meseage) => {
                appendMessageToExcel(meseage);
              })
            );
          } else {
            jsonContent = fs.readFileSync("./database.json");
            josnObject = JSON.parse(jsonContent);
            createClients(josnObject["no_clients"] - 1);
          }
        } else if (replyedMessage.body.includes("xlsx")) {
          const excelFileNumber = message.body;

          if (excelFileNumber.includes(",")) {
            const excelFilesNumbers = excelFileNumber.split(",");

            for (let excelFileNum of excelFilesNumbers) {
              databaseWorkBook = xlsx.readFile(`.\\databases\\${excelFiles[excelFileNum - 1]}`);
              databaseWorkSheet = databaseWorkBook.Sheets[databaseWorkBook.SheetNames[0]];
              databaseData = xlsx.utils.sheet_to_json(databaseWorkSheet);
              allDatabaseData = allDatabaseData.concat(databaseData);
            }
          } else {
            databaseWorkBook = xlsx.readFile(`.\\databases\\${excelFiles[excelFileNumber - 1]}`);
            databaseWorkSheet = databaseWorkBook.Sheets[databaseWorkBook.SheetNames[0]];
            databaseData = xlsx.utils.sheet_to_json(databaseWorkSheet);

            allDatabaseData = allDatabaseData.concat(databaseData);
            // console.log(allDatabaseData)
          }

          controller.sendMessage(controller.info.wid._serialized, "اختر قالب الرسالة: ");

          for (let messageFile of messagesFolder) {
            txtFilesMessage = txtFilesMessage.concat(
              `${txtFiles.indexOf(messageFile) + 1}- ${messageFile}\n`
            );
          }

          // get fitst row, the varibles put in message file

          for (let rowObj of allDatabaseData) {
            let keys = Object.keys(rowObj);
            keys.forEach((key) => {
              //   console.log(key);
              excelFirstRow.push(key);
            });

            break;
          }

          excelFirstRow.shift();

          controller.sendMessage(controller.info.wid._serialized, txtFilesMessage);
        } else if (replyedMessage.body.includes("txt")) {
          textFileNumber = message.body;

          messageContent = fs.readFileSync(`./messageTemplates/${txtFiles[textFileNumber - 1]}`, "utf8");
          jsonContent = fs.readFileSync("./database.json");
          josnObject = JSON.parse(jsonContent);

          josnObject["message"] = messageContent;

          fs.writeFileSync("./database.json", JSON.stringify(josnObject));

          controller.sendMessage(controller.info.wid._serialized, "عدد ارقام الواتساب الاضافية:");
        } else if (replyedMessage.body.includes("عدد ارقام الواتساب الاضافية:")) {
          jsonContent = fs.readFileSync("./database.json");
          josnObject = JSON.parse(jsonContent);

          whatsappClients = Number(message.body);
          josnObject["no_clients"] = whatsappClients + 1;

          for (let rowObj = 0; rowObj < allDatabaseData.length; rowObj++) {
            allDatabaseData[rowObj].clientNum = (rowObj % (whatsappClients + 1)) + 1;
          }

          josnObject["users"] = allDatabaseData;

          totalUsers = allDatabaseData.length;
          fs.writeFileSync("./database.json", JSON.stringify(josnObject));

          controller.sendMessage(controller.info.wid._serialized, "مدة التأخير بالثواني:");
        } else if (replyedMessage.body.includes("مدة التأخير بالثواني:")) {
          delay = Number(message.body);
          josnObject["delay"] = delay;
          fs.writeFileSync("./database.json", JSON.stringify(josnObject));

          // totalTime = delay * allDatabaseData.length - 1
          totalTime = josnObject["delay"] * josnObject["users"].length - 1;

          if (isReady == false) {
            createClients(whatsappClients);
          } else if (isReady == true) {
            clients.forEach((client) => sendMessage(client));
            clients.forEach((client) =>
              client.on("message", (meseage) => {
                appendMessageToExcel(meseage);
              })
            );
          }
        }
      }
    }
  });
} catch (err) {
  console.log(err);
  fs.writeFileSync("logs.txt", err.toString());
}
