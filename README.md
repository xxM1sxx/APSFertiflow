# Dokumentasi MQTT Silagung

Dokumen ini merangkum topik MQTT yang digunakan aplikasi dan contoh payload agar memudahkan integrasi dengan perangkat (mis. ESP32).

## Prefix Topik

- Prefix dasar: `silagung`
- Control: `silagung/control`
- Sensor: `silagung/sensor`
- System: `silagung/system`
- Status: `silagung/status`
- Konfigurasi Irigasi: `silagung/config`

## Topik Sensor (`silagung/sensor`)

- Deskripsi: Perangkat mempublikasikan data sensor inti yang digunakan aplikasi.
- Format payload (JSON) terkini yang didukung aplikasi:

```
{
  "waterFlow": 1.2,      // liter/menit (opsional: "water_flow")
  "pressure": 2.4,       // bar
  "ec": 1.8,             // μS/cm (opsional: "conductivity")
  "ultrasonic1": 120,    // cm (opsional: "ultrasonic_1")
  "ultrasonic2": 115     // cm (opsional: "ultrasonic_2")
}
```

Bidang yang tidak lagi digunakan: `ph`, `nitrogen (n)`, `phosphorus (p)`, `potassium (k)`, `temperature (temp)`. Mohon untuk tidak mengirim bidang tersebut bila mengikuti skema terbaru ini.

Catatan: Penerimaan data MQTT di dashboard sedang dinonaktifkan sesuai permintaan, namun skema di atas mencerminkan kebutuhan aplikasi saat aktif.

## Topik Sistem (`silagung/system`)

- Deskripsi: Perangkat mempublikasikan status/umpan balik aksi (valve/pump) ke topik ini.
- Format payload yang didukung:

Contoh 1 – format baru (satu valve per pesan):

```
{
  "valve": 1,                 // nomor valve (1..5)
  "action": "open",          // "open" atau "close"
  "status": "success",       // hasil eksekusi
  "pump": "on"               // opsional: status pompa "on"/"off"
}
```

Contoh 2 – format batch (beberapa state sekaligus):

```
{
  "valve1": "open",          // "open" / "close"
  "valve2": "close",
  "valve3": "open",
  "valve4": "close",
  "valve5": "open",
  "relay6": "on",            // status pompa: "on"/"off"
  "pump": "on"               // alternatif field untuk pompa
}
```

## Topik Kontrol

- Dasar kontrol: `silagung/control`

Mengirim perintah valve (format baru):

Topik: `silagung/control`

```
{
  "valve": 3,                 // nomor valve (1..5)
  "action": "open",          // "open" atau "close"
  "timestamp": 1730000000000,
  "clientId": "web-client"
}
```

Mengirim frekuensi pompa (payload tanpa langsung mengontrol device):

Topik: `silagung/control`

```
{
  "pump": "run",             // indikasi perintah run
  "frequency": 45,            // Hz
  "timestamp": 1730000000000,
  "clientId": "web-client"
}
```

Catatan QoS/retain: aplikasi umumnya menggunakan QoS 1. Untuk beberapa konfigurasi, `retain` dapat diaktifkan agar perangkat menerima nilai terakhir saat reconnect.

## Topik Status (`silagung/status/...`)

- Disconnect: `silagung/status/disconnect`

Contoh payload saat client disconnect:

```
{
  "clientId": "web-client-abc123",
  "timestamp": 1730000000000
}
```

- Warning: `silagung/status/warning` – format bebas sesuai kebutuhan sistem.

## Topik Konfigurasi Irigasi (`silagung/config`)

- Deskripsi: Aplikasi mempublikasikan konfigurasi irigasi untuk tiap lahan/fase.

Contoh 1 – satu konfigurasi:

```
{
  "configId": 1,
  "landName": "Lahan 1",
  "phaseName": "Vegetatif",
  "waterRequirement": 12.5,    // L/hari
  "waterPerSchedule": 2.5,     // L/jadwal
  "targetEC": 1.6,             // mS/cm
  "irrigationType": "air_nutrisi", // "air" atau "air_nutrisi"
  "schedules": [
    { "time": "08:00", "isActive": true },
    { "time": "12:00", "isActive": true },
    { "time": "16:00", "isActive": false }
  ]
}
```

Contoh 2 – beberapa konfigurasi sekaligus (batch):

```
{
  "configs": [
    {
      "configId": 1,
      "landName": "Lahan 1",
      "phaseName": "Vegetatif",
      "waterRequirement": 12.5,
      "waterPerSchedule": 2.5,
      "targetEC": 1.6,
      "irrigationType": "air_nutrisi",
      "schedules": [ { "time": "08:00", "isActive": true } ]
    },
    {
      "configId": 2,
      "landName": "Lahan 2",
      "phaseName": "Generatif",
      "waterRequirement": 10.0,
      "waterPerSchedule": 5.0,
      "targetEC": 1.2,
      "irrigationType": "air",
      "schedules": [ { "time": "09:00", "isActive": true } ]
    }
  ],
  "timestamp": 1730000000000,
  "totalConfigs": 2
}
```

## Catatan Integrasi

- Disarankan perangkat subscribe ke `silagung/control` untuk menerima perintah.
- Perangkat dapat publish umpan balik ke `silagung/system` menggunakan salah satu format di atas.
- Aplikasi saat ini menonaktifkan penerimaan data MQTT di halaman dashboard sesuai permintaan Anda.
