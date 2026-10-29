# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **src/app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **example** directory and create a blank **src/app** directory where you can start developing.

### Other setup steps

- Run `npm run lint` to check code with ESLint. See the [Expo ESLint guide](https://docs.expo.dev/guides/using-eslint/) for configuration details.
- Run `npm test` for deterministic domain and SQLite repository tests. Tests use Node's built-in test runner and SQLite; use Node.js 22.6 or newer.
- Local app data is stored in SQLite on iOS and Android. Web persistence is not configured.
- The Home tab contains the daily food log. Use **Add food** to enter nutrition manually; logged dates follow the device's local calendar date.
- Open **Search USDA foods** from the add-food form to filter and reuse saved foods offline; the same screen reports that live search is disabled until proxy approval.
- USDA search is currently unavailable. It requires an approved server-side proxy; the app does not contain a USDA API key and does not use `DEMO_KEY`. Manual food entry and local logging remain available.

## USDA food data

The planned provider is USDA FoodData Central (FDC), which includes Foundation Foods, Experimental Foods, Survey (FNDDS), SR Legacy, and Branded Foods. USDA describes its data as public domain under CC0 1.0 and requests attribution: “U.S. Department of Agriculture, Agricultural Research Service. FoodData Central.” Branded Foods are based on manufacturer-provided label information and can be rounded; source and data type are retained with imported foods.

Live search is intentionally disabled until a server-side proxy is approved. The mobile app must never contain the USDA `data.gov` API key: Expo public environment variables are bundled into the app and are not secret storage. The typed client adapter is prepared for a proxy base URL exposing `POST /foods/search` and `GET /food/{fdcId}` and returning FDC-compatible JSON; no endpoint is configured in the app. Once a proxy is approved, it should keep the key server-side and expose only the search and food-detail routes needed by the app. A search would transmit the food query and selected FDC identifier through that proxy; the local food log and other health data are not part of those requests. Review the proxy host's request logging and retention behavior before deployment.

USDA currently documents a default limit of 1,000 requests per hour per IP. The `DEMO_KEY` has shared limits of 30 requests per hour and 50 per day and is not used by the app. USDA states that API access is available to anyone; hosting cost for a proxy has not been selected or estimated. Before any proxy hosting is added, review the proposed provider, deployment steps, and expected costs.

References: [FDC API Guide](https://fdc.nal.usda.gov/api-guide/), [FDC Data Type Documentation](https://fdc.nal.usda.gov/data-documentation/), and [data.gov API key signup](https://api.data.gov/signup/).
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
