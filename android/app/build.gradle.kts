import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val dotenv = readDotEnv(rootProject.file("../web/.env.local"))
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

fun envOrDotenv(name: String): String {
    val fromEnv = System.getenv(name)?.trim().orEmpty()
    if (fromEnv.isNotEmpty()) return fromEnv
    return dotenv[name].orEmpty()
}

val collectorVersionCode = resolveVersionCode()
val collectorVersionName = System.getenv("VERSION_NAME")?.trim().takeUnless { it.isNullOrEmpty() }
    ?: "1.0.$collectorVersionCode"

android {
    namespace = "com.marsledger.collector"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.marsledger.collector"
        minSdk = 26
        targetSdk = 35
        versionCode = collectorVersionCode
        versionName = collectorVersionName
        buildConfigField("String", "SUPABASE_URL", asBuildConfigString(envOrDotenv("VITE_SUPABASE_URL").trim().trimEnd('/')))
        buildConfigField("String", "SUPABASE_ANON_KEY", asBuildConfigString(envOrDotenv("VITE_SUPABASE_ANON_KEY")))
        buildConfigField("String", "UPDATE_REPO", asBuildConfigString("saintpark90/MarsLedger"))
    }

    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets.getByName("main").assets.srcDir("../../shared")
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}

tasks.configureEach {
    if (name == "assembleRelease") {
        doLast {
            val apkDir = layout.buildDirectory.dir("outputs/apk/release").get().asFile
            val built = apkDir.resolve("app-release.apk")
            if (built.exists()) built.copyTo(apkDir.resolve("MarsLedger-collector.apk"), overwrite = true)
        }
    }
}

fun readDotEnv(file: java.io.File): Map<String, String> {
    if (!file.exists()) return emptyMap()
    return file.readLines()
        .map { it.trim() }
        .filter { it.isNotEmpty() && !it.startsWith("#") && "=" in it }
        .associate { line ->
            val index = line.indexOf("=")
            val key = line.substring(0, index).trim()
            val value = line.substring(index + 1).trim().removeSurrounding("\"").removeSurrounding("'")
            key to value
        }
}

fun asBuildConfigString(value: String): String {
    val escaped = buildString {
        for (ch in value.trim()) {
            when (ch) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                else -> append(ch)
            }
        }
    }
    return "\"$escaped\""
}

fun resolveVersionCode(): Int {
    System.getenv("VERSION_CODE")?.toIntOrNull()?.let { return it }
    return try {
        val process = ProcessBuilder("git", "rev-list", "--count", "HEAD")
            .directory(rootProject.projectDir.parentFile)
            .redirectErrorStream(true)
            .start()
        val output = process.inputStream.bufferedReader().readText().trim()
        if (process.waitFor() == 0) output.toIntOrNull() ?: 1 else 1
    } catch (_: Exception) {
        1
    }
}
