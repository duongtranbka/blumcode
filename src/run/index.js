import colors from "colors";
import dayjs from "dayjs";
import delayHelper from "../helpers/delay.js";
import fileHelper from "../helpers/file.js";
import authService from "../services/auth.js";
import dailyService from "../services/daily.js";
import farmingClass from "../services/farming.js";
import gameService from "../services/game.js";
import inviteClass from "../services/invite.js";
import taskService from "../services/task.js";
import tribeService from "../services/tribe.js";
import userService from "../services/user.js";

// Điều chỉnh khoảng cách thời gian chạy vòng lặp đầu tiên giữa các luồng tránh bị spam request (tính bằng giây)
const DELAY_ACC = 30;
// Đặt số lần thử kết nối lại tối đa khi proxy lỗi, nếu thử lại quá số lần cài đặt sẽ dừng chạy tài khoản đó và ghi lỗi vào file log
const MAX_RETRY_PROXY = 20;
// Đặt số lần thử đăng nhập tối đa khi đăng nhập lỗi, nếu thử lại quá số lần cài đặt sẽ dừng chạy tài khoản đó và ghi lỗi vào file log
const MAX_RETRY_LOGIN = 20;

const run = async (user) => {
  let countRetryProxy = 0;
  let countRetryLogin = 0;
  await delayHelper.delay((user.index - 1) * DELAY_ACC);
  while (true) {
    // Kiểm tra kết nối proxy
    let isProxyConnected = false;
    while (!isProxyConnected) {
      const ip = await user.http.checkProxyIP();
      if (ip === -1) {
        user.log.logError(
          "Proxy lỗi, kiểm tra lại kết nối proxy, sẽ thử kết nối lại sau 30s"
        );
        countRetryProxy++;
        if (countRetryProxy >= MAX_RETRY_PROXY) {
          break;
        } else {
          await delayHelper.delay(30);
        }
      } else {
        countRetryProxy = 0;
        isProxyConnected = true;
      }
    }
    try {
      if (countRetryProxy >= MAX_RETRY_PROXY) {
        const dataLog = `[No ${user.index} _ ID: ${
          user.info.id
        } _ Time: ${dayjs().format(
          "YYYY-MM-DDTHH:mm:ssZ[Z]"
        )}] Lỗi kết nối proxy - ${user.proxy}`;
        fileHelper.writeLog("log.error.txt", dataLog);
        break;
      }

      if (countRetryLogin >= MAX_RETRY_LOGIN) {
        const dataLog = `[No ${user.index} _ ID: ${
          user.info.id
        } _ Time: ${dayjs().format(
          "YYYY-MM-DDTHH:mm:ssZ[Z]"
        )}] Lỗi đăng nhập thất bại quá ${MAX_RETRY_LOGIN} lần`;
        fileHelper.writeLog("log.error.txt", dataLog);
        break;
      }
    } catch (error) {
      user.log.logError("Ghi lỗi thất bại");
    }

    // Đăng nhập tài khoản
    const login = await authService.handleLogin(user);
    if (!login.status) {
      countRetryLogin++;
      await delayHelper.delay(60);
      continue;
    } else {
      countRetryLogin = 0;
    }

    await dailyService.checkin(user);
    await tribeService.handleTribe(user);
    await taskService.handleTask(user);
    await inviteClass.handleInvite(user);
    const awaitTime = await farmingClass.handleFarming(
      user,
      login.profile?.farming
    );
    await gameService.handleGame(user, login.profile?.playPasses);
    await delayHelper.delay((awaitTime + 1) * 60);
  }
};


console.log("");
console.log("");
console.log("");
const users = await userService.loadUser();

for (const [index, user] of users.entries()) {
  run(user);
}
