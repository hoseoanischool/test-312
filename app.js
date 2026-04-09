// ====== 설정 ======
const ROOMS = ["312호"]; // 단일 강의실로 변경

const SEATS_BY_ROOM = {
  "312호": Array.from({ length: 35 }, (_, i) => String(i + 1)), // 좌석 수 35개로 변경
};

// 고정 좌석 설정
const fixedSeatsByRoom = {
  "312호": {}
};

// 야작 금지 인원 설정
const BANNED_USERS = [
  // 필요시 여기에 야작 금지 인원 추가
];

// CSV 복사 기능 관리자 비밀번호
const ADMIN_PASSWORD = '0415405841-2026-1-0409';

const KST_OFFSET_MIN = 9 * 60; // KST +09:00
// ===================

function nowKST() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + KST_OFFSET_MIN * 60000);
}

function pad2(n) { return String(n).padStart(2, "0"); }

function ymdKST(d = nowKST()) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function getWeekDatesKST(base = nowKST()) {
  const dow = base.getDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMon);
  monday.setHours(0,0,0,0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function labelKOR(d) {
  const w = ["일","월","화","수","목","금","토"][d.getDay()];
  return `${d.getMonth()+1}/${d.getDate()}(${w})`;
}

const $weekTabs = document.getElementById("weekTabs");
const $seatLayout = document.getElementById("seatLayout");
const $modal = document.getElementById("bookingModal");
const $modalTitle = document.getElementById("modalTitle");
const $modalName = document.getElementById("modalName");
const $modalStudentId = document.getElementById("modalStudentId");
const $modalPhone = document.getElementById("modalPhoneNumber");
const $modalSubmitBtn = document.getElementById("modalSubmitBtn");
const $modalCloseBtn = document.getElementById("modalCloseBtn");
const $searchName = document.getElementById("searchName");
const $searchStudentId = document.getElementById("searchStudentId");
const $searchPhone = document.getElementById("searchPhoneNumber");
const $searchBtn = document.getElementById("searchBtn");
const $reservationList = document.getElementById("reservationList");
const $copyCsvBtn = document.getElementById("copyCsvBtn");
const $confirmationModal = document.getElementById("confirmationModal");
const $confirmationMessage = document.getElementById("confirmationMessage");
const $confirmationCloseBtn = document.getElementById("confirmationCloseBtn");
const $openChatLinkContainer = document.getElementById("openChatLinkContainer");


let activeRoom = ROOMS[0]; // 항상 312호
let activeDate = nowKST();
let activeDateKey = ymdKST(activeDate);
let selectedSeat = null;
let bookingsRef = null;
let bookingsUnsub = null;

function renderWeekTabs() {
  $weekTabs.innerHTML = "";
  const week = getWeekDatesKST(nowKST());
  week.forEach(d => {
    const btn = document.createElement("button");
    const key = ymdKST(d);
    btn.textContent = labelKOR(d);
    btn.className = (key === activeDateKey) ? "active" : "inactive";
    btn.onclick = () => {
      activeDate = new Date(d);
      activeDateKey = ymdKST(activeDate);
      renderWeekTabs();
      attachBookingsListener();
    };
    $weekTabs.appendChild(btn);
  });
}

function renderSeats(snapshotVal) {
  $seatLayout.innerHTML = "";
  const bookings = snapshotVal || {};
  const seatsInRoom = SEATS_BY_ROOM[activeRoom] || [];
  const fixedSeats = fixedSeatsByRoom[activeRoom] || {};
  const todayKey = ymdKST(nowKST());
  const isPastDate = activeDateKey < todayKey;

  // room-312 클래스 추가
  $seatLayout.classList.remove("past-date");
  $seatLayout.classList.add(`room-${activeRoom.replace('호', '')}`);
  if (isPastDate) $seatLayout.classList.add("past-date");

  seatsInRoom.forEach(seat => {
    const div = document.createElement("div");
    div.className = "seat";
    div.dataset.seatNumber = seat;
    
    const fixedName = fixedSeats[seat];
    const bookedData = bookings[seat];

    if (fixedName) div.classList.add("fixed");
    if (bookedData) div.classList.add("booked");

    let nameText = fixedName ? fixedName : (bookedData ? bookedData.name : "예약 가능");
    div.innerHTML = `<strong>${seat}</strong><div class="name">${nameText}</div>`;

    if (isPastDate) {
      div.onclick = () => alert("지난 날짜는 예약 불가능 합니다");
    } else if (fixedName) {
      div.onclick = () => alert(`${activeRoom} ${seat}번은 고정 좌석(${fixedName})입니다.`);
    } else if (bookedData) {
      div.onclick = () => alert("이미 예약된 좌석입니다.");
    } else {
      div.title = "예약 가능";
      div.onclick = () => openModal(seat);
    }
    $seatLayout.appendChild(div);
  });
}

function openModal(seat) {
  selectedSeat = seat;
  $modalTitle.textContent = `${activeDateKey} · ${activeRoom} 좌석 ${seat} 예약`;
  $modal.classList.add("show");
  $modalName.focus();
}

function closeModal() {
  $modal.classList.remove("show");
}

async function submitBooking() {
  const name = $modalName.value.trim();
  const sid = $modalStudentId.value.trim();
  const phone = $modalPhone.value.trim();

  if (!selectedSeat || !name || !sid || !phone) {
    alert("이름, 학번, 나만의 4자리 숫자를 모두 입력하세요.");
    return;
  }
  
  const consentRef = db.ref(`consents/${sid}`);
  const consentSnap = await consentRef.get();
  
  if (!consentSnap.exists()) {
    const consentText = `개인 정보 수집 동의
- 입력된 이름과 학번은 서비스형 백엔드 시스템에 저장됩니다.
- 한 학기에 한 번씩 저장된 정보는 삭제될 예정입니다.
- 야작 채팅방 내 공지사항 필독 바라며, 해당 사항을 지키지 않을 시 추후 불이익을 받을 수 있습니다.
- 동의하지 않을 시, 야작 진행이 어렵습니다.
- 해당 팝업은 최초 야작 신청 시에만 뜹니다.`;
    if (confirm(consentText)) {
      await consentRef.set({ agreedAt: Date.now() });
    } else {
      alert("개인정보 수집에 동의하지 않아 예약을 진행할 수 없습니다.");
      return;
    }
  }

  if (BANNED_USERS.some(user => user.studentId === sid)) {
    alert("신청 불가 기간입니다.");
    return;
  }

  if (!/^\d{8}$/.test(sid)) {
    alert("학번을 입력해 주세요");
    return;
  }
  
  if (!/^\d{4}$/.test(phone)) {
    alert("4자리 숫자를 입력해 주세요");
    return;
  }

  const bookingsSnap = await db.ref(`bookings/${activeRoom}/${activeDateKey}`).get();
  const bookings = bookingsSnap.val() || {};
  if (Object.values(bookings).some(b => b.studentId === sid)) {
    alert(`이미 이 날짜에 다른 좌석을 예약했습니다.`);
    return;
  }

  const seatRef = db.ref(`bookings/${activeRoom}/${activeDateKey}/${selectedSeat}`);
  const seatSnap = await seatRef.get();
  if (seatSnap.exists()) {
    alert("이미 예약된 좌석입니다.");
    return;
  }

  await seatRef.set({ name, studentId: sid, phone, createdAt: Date.now() });

  const profileName = `${activeRoom}-${selectedSeat}-${sid}-${name}`;
  closeModal();
  showConfirmationModal(profileName);
}

async function searchReservation() {
  const name = $searchName.value.trim();
  const sid = $searchStudentId.value.trim();
  const phone = $searchPhone.value.trim();

  $reservationList.innerHTML = "";
  $openChatLinkContainer.innerHTML = "";

  if (!name || !sid || !phone) {
    alert("예약 조회를 위해 이름, 학번, 나만의 4자리 숫자를 모두 입력해주세요.");
    return;
  }

  const allRoomsBookings = await db.ref("bookings").get();
  const roomsData = allRoomsBookings.val() || {};
  const results = [];

  for (const [room, roomBookings] of Object.entries(roomsData)) {
    for (const [date, dayBookings] of Object.entries(roomBookings)) {
      Object.entries(dayBookings).forEach(([seat, v]) => {
        const rec = v || {};
        if (rec.name === name && rec.studentId === sid && rec.phone === phone) {
          results.push({ room, date, seat, ...rec });
        }
      });
    }
  }

  if (results.length === 0) {
    $reservationList.textContent = "해당 조건에 맞는 예약이 없습니다.";
    return;
  }

  $openChatLinkContainer.innerHTML = `
    <a href="https://open.kakao.com/o/gS1ZZ8gh" target="_blank" rel="noopener noreferrer" style="color: #3498db; font-weight: bold; text-decoration: none;">
      ▶ 야작 오픈 채팅방 바로가기
    </a>
  `;

  results.forEach(res => {
    const row = document.createElement("div");
    row.className = "res-item";
    row.innerHTML = `
      <div>
        <strong>${res.date}</strong> · ${res.room} 좌석 <strong>${res.seat}</strong>
        <div style="font-size:12px;color:#555">${res.name} / ${res.studentId}</div>
      </div>
      <div>
        <button data-room="${res.room}" data-date="${res.date}" data-seat="${res.seat}" class="cancel-btn">취소</button>
      </div>
    `;
    row.querySelector(".cancel-btn").onclick = async (e) => {
      const { room, date, seat } = e.target.dataset;
      const confirmMsg = `${date} ${room} 좌석 ${seat}\n정말 취소하시겠습니까?`;
      if (!confirm(confirmMsg)) return;

      const ref = db.ref(`bookings/${room}/${date}/${seat}`);
      const curr = await ref.get();
      const cv = curr.val();
      if (!cv) { alert("이미 취소되었거나 존재하지 않습니다."); return; }
      if (cv.name !== name || cv.studentId !== sid || cv.phone !== phone) {
        alert("예약자 정보가 일치하지 않습니다.");
        return;
      }

      await ref.remove();
      alert("취소되었습니다.");
      searchReservation();
    };
    $reservationList.appendChild(row);
  });
}

async function copyCsv() {
    const inputPassword = prompt("관리자 비밀번호를 입력하세요:");
  
    if (inputPassword === null) return;
  
    if (inputPassword !== ADMIN_PASSWORD) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }
  
    const snap = await db.ref(`bookings/${activeRoom}/${activeDateKey}`).get();
    const data = snap.val() || {};
    const seatsInRoom = SEATS_BY_ROOM[activeRoom] || [];
    const rows = [["seatId","name","studentId","phone"]];
    seatsInRoom.forEach(seat => {
      const r = data[seat] || {};
      rows.push([seat, r.name||"", r.studentId||"", r.phone||""]);
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    await navigator.clipboard.writeText(csv);
    alert(`${activeDateKey} ${activeRoom} 좌석-명단 CSV가 복사되었습니다.`);
}

function showConfirmationModal(profileName) {
  const message = `
    프로필 이름을 <strong>'${profileName}'</strong>으로 설정한 후 입장 바랍니다.<br><br>
    <a href="https://open.kakao.com/o/gS1ZZ8gh" target="_blank" rel="noopener noreferrer" style="color: #3498db; font-weight: bold; text-decoration: none;">
      ▶ 야작 오픈 채팅방 입장하기
    </a>
  `;
  $confirmationMessage.innerHTML = message;
  $confirmationModal.classList.add("show");
}

function closeConfirmationModal() {
  $confirmationModal.classList.remove("show");
}

function attachBookingsListener() {
  if (bookingsUnsub) {
    bookingsRef.off("value", bookingsUnsub);
  }
  bookingsRef = db.ref(`bookings/${activeRoom}/${activeDateKey}`);
  bookingsUnsub = bookingsRef.on("value", snap => renderSeats(snap.val()));
}

$modalCloseBtn.onclick = closeModal;
$modalSubmitBtn.onclick = submitBooking;
$searchBtn.onclick = searchReservation;
$copyCsvBtn.onclick = copyCsv;
$confirmationCloseBtn.onclick = closeConfirmationModal;

renderWeekTabs();

attachBookingsListener();
if ($modalCloseBtn) $modalCloseBtn.onclick = closeModal;
if ($modalSubmitBtn) $modalSubmitBtn.onclick = submitBooking;
if ($searchBtn) $searchBtn.onclick = searchReservation;
if ($copyCsvBtn) $copyCsvBtn.onclick = copyCsv;
if ($confirmationCloseBtn) $confirmationCloseBtn.onclick = closeConfirmationModal;

renderWeekTabs();
attachBookingsListener();
