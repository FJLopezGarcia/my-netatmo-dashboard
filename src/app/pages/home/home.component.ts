import { Component, OnInit, ViewChild } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/auth';
import { AngularFirestore } from '@angular/fire/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap, take } from 'rxjs/operators';
import { User } from '../../models/user';
import { NetatmoService } from '../../services/netatmo.service';
import * as moment from 'moment';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Chart } from 'chart.js';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {
  @ViewChild('lineChartDaily') private chartRefDaily;
  @ViewChild('lineChartMonthly') private chartRefchartMonthly;

  chartDaily: any;
  chartMonthly: any;
  dataset_boiler_on: any = ([] = []);

  // Used for Charts
  bars: any;
  colorArray: any;

  lessThanOrGreaterThan = 'lessThan';
  filterLimit = 100;
  levelsArr: any = ([]);
  months: any = ([]);
  from: string;
  toMonth: string;

  values$: Observable<User>;

  boilerDayResult: any = ([] = []);
  boilerMonthResult: any = ([] = []);
  weatherExternalResult: any = ([] = []);
  weatherBedroomResult: any = ([] = []);

  netatmoAuthorize: string | null = null;
  authorizeError: string | null = null;

  constructor(
    readonly afAuth: AngularFireAuth,
    private readonly afs: AngularFirestore,
    private readonly activatedRoute: ActivatedRoute,
    private readonly netatomService: NetatmoService,
    private readonly router: Router
  ) {}

  logout(): void {
    this.afAuth.auth.signOut();
    this.router.navigate(['/login']);
  }

  ngOnInit() {
    this.authorizeError = null;
    this.netatmoAuthorize = null;
    if (this.activatedRoute.snapshot.queryParamMap.has('error')) {
      const error = this.activatedRoute.snapshot.queryParamMap.get('error');
      switch (error) {
        case 'invalid_request':
          this.authorizeError =
            'The request is missing a required parameter, includes an unsupported parameter or parameter value, or is otherwise malformed.';
          break;
        case 'invalid_client':
          this.authorizeError = 'The client identifier provided is invalid.';
          break;
        case 'unauthorized_client':
          this.authorizeError = 'The client is not authorized to use the requested response type.';
          break;
        case 'redirect_uri_mismatch':
          this.authorizeError = 'The redirection URI provided does not match a pre-registered value.';
          break;
        case 'access_denied':
          this.authorizeError = 'The end-user or authorization server denied the request.';
          break;
        case 'unsupported_response_type':
          this.authorizeError = 'The requested response type is not supported by the authorization server.';
          break;
        case 'invalid_scope':
          this.authorizeError = 'The requested scope is invalid, unknown, or malformed.';
          break;
      }
    } else {
      this.values$ = this.afAuth.user.pipe(
        map(user => user.uid),
        switchMap(uid =>
          this.afs
            .collection('users')
            .doc<User>(uid)
            .valueChanges()
        ),
        tap(user => {
          if (user == null || user.access_token == null) {
            this.netatmoAuthorize = this.netatomService.buildAuthorizationUrl();
            console.log('buildAuthorizationUrl: ', this.netatmoAuthorize);
          }
        }),
        switchMap(user => {
          if (user != null && user.expires_at <= Date.now() && user.refresh_token != null) {
            console.log('refresh netatmo access token using refresh token');
            return this.netatomService.refreshAccessToken(user.refresh_token).pipe(
              map(
                res => ({
                  access_token: res.access_token,
                  expires_at: new Date(Date.now() + res.expires_in * 1000).valueOf(),
                  refresh_token: res.refresh_token,
                  uid: user.uid,
                  enabled: user.enabled,
                }),
                tap((newUser: User) => {
                  console.log('updating user in firestore', newUser);
                  this.afs
                    .collection('users')
                    .doc<User>(user.uid)
                    .set(newUser, { merge: true });
                })
              )
            );
          } else if (user != null && user.refresh_token == null) {
            return throwError('Cannot refresh netatmo access token because the refresh token does not exist.');
          } else {
            console.log('user', user);
            return of(user);
          }
        }),
        catchError(err => {
          console.error('An error occurred while fetching data from firestore:', err);
          return of(null);
        })
      );
      // this.getMeasureByDays();
      // this.getMeasureMonhly();
    }
  }

  applyDateFilter() {
    // tslint:disable-next-line:radix
    this.chartDaily.data.labels = this.levelsArr.slice(parseInt(this.from), parseInt(this.toMonth) + 1);
    console.log('DateFilter: ' + this.chartDaily.data.labels);
    this.chartDaily.update();
  }
  applyFilter(value) {

    this.chartDaily.data.datasets[0].data = this.dataset_boiler_on;

    this.chartDaily.data.datasets.forEach((data, i) => {
      if (this.lessThanOrGreaterThan === 'greaterThan') {
        this.chartDaily.data.datasets[i].data = data.data.map(v => {
          if ( v >= value ) { return v; } else { return 0; }
        });
       // console.log(">>>>>>>>", this.barChart.data.datasets[i].data);
      } else {
        this.chartDaily.data.datasets[i].data = data.data.map(v => {
          if (v <= value) { return v; } else { return 0; }
        });
        // console.log("?????????", this.barChart.data.datasets[i].data);
      }
    });
    this.chartDaily.update();
  }


  async getMeasureByDays() {

    const scale = '1day'; // 1month, 1day

    // const date_begin = moment('2020-09')
    //   .startOf('month')
    //   .unix();

    const date_begin = moment('2020-09-25')
      .startOf('day')
      .unix();

    const date_end = moment()
      .endOf('month')
      .unix();

    // console.log('******** Timeline by Day ********');
    // console.log('date_begin (timestamp): ', date_begin);
    // console.log('date_begin: ', moment.unix(date_begin).format('DD/MM/YYYY HH:mmA'));
    // console.log('date_end (timestamp): ', date_end);
    // console.log('date_end: ', moment.unix(date_end).format('DD/MM/YYYY HH:mmA'));
    // console.log('*******************************');

    const values = await this.values$.pipe(take(1)).toPromise();
    console.log(values);

    if (values !== null) {
      // reset result to be able to reload one every click
      this.boilerDayResult = [] = [];
      this.weatherExternalResult = [] = [];
      this.weatherBedroomResult = [] = [];

      // Boiler
      this.netatomService.getBoilerMeasure(values.access_token, scale, date_begin, date_end).subscribe(netatmomesure => {
        Object.keys(netatmomesure['body']).forEach(key => {
          this.boilerDayResult.push({
            date: key,
            boiler_on: Math.round((netatmomesure['body'][key][0] / 3600) * 100) / 100,
            boiler_off: Math.round((netatmomesure['body'][key][1] / 3600) * 100) / 100,
            total: Math.round(netatmomesure['body'][key][0] / 3600 + netatmomesure['body'][key][1] / 3600),
          });
        });
        console.log('******** getMeasure BOILER by Day result ********');
        console.log(this.boilerDayResult);
      });
      // Weather
      this.netatomService.getWeatherExternalMeasure(values.access_token, scale, date_begin, date_end).subscribe(netatmomesure => {
        Object.keys(netatmomesure['body']).forEach(key => {
          this.weatherExternalResult.push({
            date: key,
            Temperature: netatmomesure['body'][key][0],
            Humidity: netatmomesure['body'][key][1],
            min_temp: netatmomesure['body'][key][2],
            max_temp: netatmomesure['body'][key][3],
            rain: netatmomesure['body'][key][4],
          });
        });
        console.log('******** getMeasure WEATHER EXTERNAL by Day result ********');
        console.log(this.weatherExternalResult);

      });
      this.netatomService.getWeatherbedroomMeasure(values.access_token, scale, date_begin, date_end).subscribe(netatmomesure => {
        Object.keys(netatmomesure['body']).forEach(key => {
          this.weatherBedroomResult.push({
            date: key,
            Temperature: netatmomesure['body'][key][0],
            Humidity: netatmomesure['body'][key][1],
            min_temp: netatmomesure['body'][key][2],
            max_temp: netatmomesure['body'][key][3]
          });
        });
        console.log('******** getMeasure WEATHER BEDROOM by Day result ********');
        console.log(this.weatherBedroomResult);
        this.createBarChartDaily();
      });
    }
  }

  async getMeasureMonhly() {
    const scale = '1month'; // 1month, 1day
    const values = await this.values$.pipe(take(1)).toPromise();

    const date_begin = moment('2017-01')
      .startOf('month')
      .unix();
    const date_end = moment()
      .endOf('month')
      .unix();

    console.log('******** Timeline by Month ********');
    console.log('date_begin (timestamp): ', date_begin);
    console.log('date_begin: ', moment.unix(date_begin).format('DD/MM/YYYY HH:mmA'));
    console.log('date_end (timestamp): ', date_end);
    console.log('date_end: ', moment.unix(date_end).format('DD/MM/YYYY HH:mmA'));

    if (values !== null) {
      this.boilerMonthResult = [] = [];

      this.netatomService.getBoilerMeasure(values.access_token, scale, date_begin, date_end).subscribe(netatmomesure => {
        Object.keys(netatmomesure['body']).forEach(key => {
          this.boilerMonthResult.push({
            date: key,
            boiler_on: Math.round((netatmomesure['body'][key][0] / 3600) * 100) / 100,
            boiler_off: Math.round((netatmomesure['body'][key][1] / 3600) * 100) / 100,
            total: Math.round(netatmomesure['body'][key][0] / 3600 + netatmomesure['body'][key][1] / 3600),
          });
        });
        console.log('******** getMeasure BOILER by Month result ********');
        console.log(this.boilerMonthResult);
        this.createBarChartMonthly();
      });
    }
  }

  createBarChartDaily() {
    // Boiler
    const dataset_date: any = ([] = []);
    // const dataset_boiler_on: any = ([] = []);
    const dataset_boiler_off: any = ([] = []);
    const dataset_total: any = ([] = []);

    // Weather External
    const dataset_weather_external_date: any = ([] = []);
    const dataset_weather_external_temp: any = ([] = []);
    const dataset_weather_external_hum: any = ([] = []);
    const dataset_weather_external_min_temp: any = ([] = []);
    const dataset_weather_external_max_temp: any = ([] = []);
    const dataset_weather_external_rain: any = ([] = []);

    // Weather bedroom
    const dataset_weather_bedroom_date: any = ([] = []);
    const dataset_weather_bedroom_temp: any = ([] = []);
    const dataset_weather_bedroom_hum: any = ([] = []);
    const dataset_weather_bedroom_min_temp: any = ([] = []);
    const dataset_weather_bedroom_max_temp: any = ([] = []);

    const mydates: Array<{month: string, value: string}> = [];

    for (const k in this.boilerDayResult) {
      if (this.boilerDayResult.hasOwnProperty(k)) {
        mydates.push({month: moment.unix(this.boilerDayResult[k].date).format('DD/MM/YYYY'), value: k});

        dataset_date.push(moment.unix(this.boilerDayResult[k].date).format('DD/MM/YYYY'));
        this.dataset_boiler_on.push(this.boilerDayResult[k].boiler_on);
        dataset_boiler_off.push(this.boilerDayResult[k].boiler_off);
        dataset_total.push(this.boilerDayResult[k].total);
      }
    }

    this.levelsArr = dataset_date;
    this.months = mydates;
    this.from = '0';
    this.toMonth = mydates.length.toString();

    for (const k in this.weatherExternalResult) {
      if (this.weatherExternalResult.hasOwnProperty(k)) {
        dataset_weather_external_date.push(moment.unix(this.weatherExternalResult[k].date).format('DD/MM/YYYY'));
        dataset_weather_external_temp.push(this.weatherExternalResult[k].Temperature);
        dataset_weather_external_hum.push(this.weatherExternalResult[k].Humidity);
        dataset_weather_external_min_temp.push(this.weatherExternalResult[k].min_temp);
        dataset_weather_external_max_temp.push(this.weatherExternalResult[k].max_temp);
        dataset_weather_external_rain.push(this.weatherExternalResult[k].rain);
      }
    }

    for (const k in this.weatherBedroomResult) {
      if (this.weatherBedroomResult.hasOwnProperty(k)) {
        dataset_weather_bedroom_date.push(moment.unix(this.weatherBedroomResult[k].date).format('DD/MM/YYYY'));
        dataset_weather_bedroom_temp.push(this.weatherBedroomResult[k].Temperature);
        dataset_weather_bedroom_hum.push(this.weatherBedroomResult[k].Humidity);
        dataset_weather_bedroom_min_temp.push(this.weatherBedroomResult[k].min_temp);
        dataset_weather_bedroom_max_temp.push(this.weatherBedroomResult[k].max_temp);
      }
    }

    const chartColors = {
      red: 'rgb(255, 99, 132)',
      orange: 'rgb(255, 159, 64)',
      yellow: 'rgb(255, 205, 86)',
      green: 'rgb(75, 192, 192)',
      blue: 'rgb(54, 162, 235)',
      purple: 'rgb(153, 102, 255)',
      grey: 'rgb(201, 203, 207)',
    };
    // https://www.rapidtables.com/web/color/RGB_Color.html
    const BasicChartColors = {
      Black: 'rgb(0,0,0)',
      White: 'rgb(255,255,255)',
      Red:	'rgb(255,0,0)',
      Lime:	'rgb(0,255,0)',
      Blue:	'rgb(0,0,255)',
      Yellow:	'rgb(255,255,0)',
      Aqua:	'rgb(0,255,255)',
      Fuchsia:	'rgb(255,0,255)',
      Silver:	'rgb(192,192,192)',
      Gray:	'rgb(128,128,128)',
      Maroon:	'rgb(128,0,0)',
      Olive:	'rgb(128,128,0)',
      Green:	'rgb(0,128,0)',
      Purple:	'rgb(128,0,128)',
      Teal:	'rgb(0,128,128)',
      Navy:	'rgb(0,0,128)'
    };
    const NoBasicChartColors = {
      maroon: 'rgb(128,0,0)',
      dark_red: 'rgb(139,0,0)',
      brown: 'rgb(165,42,42)',
      firebrick: 'rgb(178,34,34)',
      crimson: 'rgb(220,20,60)',
      red: 'rgb(255,0,0)',
      tomato: 'rgb(255,99,71)',
      coral: 'rgb(255,127,80)',
      indian_red: 'rgb(205,92,92)',
      light_coral: 'rgb(240,128,128)',
      dark_salmon: 'rgb(233,150,122)',
      salmon: 'rgb(250,128,114)',
      light_salmon: 'rgb(255,160,122)',
      orange_red: 'rgb(255,69,0)',
      dark_orange: 'rgb(255,140,0)',
      orange: 'rgb(255,165,0)',
      gold: 'rgb(255,215,0)',
      dark_golden_rod: 'rgb(184,134,11)',
      golden_rod: 'rgb(218,165,32)',
      pale_golden_rod: 'rgb(238,232,170)',
      dark_khaki: 'rgb(189,183,107)',
      khaki: 'rgb(240,230,140)',
      olive: 'rgb(128,128,0)',
      yellow: 'rgb(255,255,0)',
      yellow_green: 'rgb(154,205,50)',
      dark_olive_green: 'rgb(85,107,47)',
      olive_drab: 'rgb(107,142,35)',
      lawn_green: 'rgb(124,252,0)',
      chart_reuse: 'rgb(127,255,0)',
      green_yellow: 'rgb(173,255,47)',
      dark_green: 'rgb(0,100,0)',
      green: 'rgb(0,128,0)',
      forest_green: 'rgb(34,139,34)',
      lime: 'rgb(0,255,0)',
      lime_green: 'rgb(50,205,50)',
      light_green: 'rgb(144,238,144)',
      pale_green: 'rgb(152,251,152)',
      dark_sea_green: 'rgb(143,188,143)',
      medium_spring_green: 'rgb(0,250,154)',
      spring_green: 'rgb(0,255,127)',
      sea_green: 'rgb(46,139,87)',
      medium_aqua_marine: 'rgb(102,205,170)',
      medium_sea_green: 'rgb(60,179,113)',
      light_sea_green: 'rgb(32,178,170)',
      dark_slate_gray: 'rgb(47,79,79)',
      teal: 'rgb(0,128,128)',
      dark_cyan: 'rgb(0,139,139)',
      aqua: 'rgb(0,255,255)',
      cyan: 'rgb(0,255,255)',
      light_cyan: 'rgb(224,255,255)',
      dark_turquoise: 'rgb(0,206,209)',
      turquoise: 'rgb(64,224,208)',
      medium_turquoise: 'rgb(72,209,204)',
      pale_turquoise: 'rgb(175,238,238)',
      aqua_marine: 'rgb(127,255,212)',
      powder_blue: 'rgb(176,224,230)',
      cadet_blue: 'rgb(95,158,160)',
      steel_blue: 'rgb(70,130,180)',
      corn_flower_blue: 'rgb(100,149,237)',
      deep_sky_blue: 'rgb(0,191,255)',
      dodger_blue: 'rgb(30,144,255)',
      light_blue: 'rgb(173,216,230)',
      sky_blue: 'rgb(135,206,235)',
      light_sky_blue: 'rgb(135,206,250)',
      midnight_blue: 'rgb(25,25,112)',
      navy: 'rgb(0,0,128)',
      dark_blue: 'rgb(0,0,139)',
      medium_blue: 'rgb(0,0,205)',
      blue: 'rgb(0,0,255)',
      royal_blue: 'rgb(65,105,225)',
      blue_violet: 'rgb(138,43,226)',
      indigo: 'rgb(75,0,130)',
      dark_slate_blue: 'rgb(72,61,139)',
      slate_blue: 'rgb(106,90,205)',
      medium_slate_blue: 'rgb(123,104,238)',
      medium_purple: 'rgb(147,112,219)',
      dark_magenta: 'rgb(139,0,139)',
      dark_violet: 'rgb(148,0,211)',
      dark_orchid: 'rgb(153,50,204)',
      medium_orchid: 'rgb(186,85,211)',
      purple: 'rgb(128,0,128)',
      thistle: 'rgb(216,191,216)',
      plum: 'rgb(221,160,221)',
      violet: 'rgb(238,130,238)',
      magenta_fuchsia: 'rgb(255,0,255)',
      orchid: 'rgb(218,112,214)',
      medium_violet_red: 'rgb(199,21,133)',
      pale_violet_red: 'rgb(219,112,147)',
      deep_pink: 'rgb(255,20,147)',
      hot_pink: 'rgb(255,105,180)',
      light_pink: 'rgb(255,182,193)',
      pink: 'rgb(255,192,203)',
      antique_white: 'rgb(250,235,215)',
      beige: 'rgb(245,245,220)',
      bisque: 'rgb(255,228,196)',
      blanched_almond: 'rgb(255,235,205)',
      wheat: 'rgb(245,222,179)',
      corn_silk: 'rgb(255,248,220)',
      lemon_chiffon: 'rgb(255,250,205)',
      light_golden_rod_yellow: 'rgb(250,250,210)',
      light_yellow: 'rgb(255,255,224)',
      saddle_brown: 'rgb(139,69,19)',
      sienna: 'rgb(160,82,45)',
      chocolate: 'rgb(210,105,30)',
      peru: 'rgb(205,133,63)',
      sandy_brown: 'rgb(244,164,96)',
      burly_wood: 'rgb(222,184,135)',
      tan: 'rgb(210,180,140)',
      rosy_brown: 'rgb(188,143,143)',
      moccasin: 'rgb(255,228,181)',
      navajo_white: 'rgb(255,222,173)',
      peach_puff: 'rgb(255,218,185)',
      misty_rose: 'rgb(255,228,225)',
      lavender_blush: 'rgb(255,240,245)',
      linen: 'rgb(250,240,230)',
      old_lace: 'rgb(253,245,230)',
      papaya_whip: 'rgb(255,239,213)',
      sea_shell: 'rgb(255,245,238)',
      mint_cream: 'rgb(245,255,250)',
      slate_gray: 'rgb(112,128,144)',
      light_slate_gray: 'rgb(119,136,153)',
      light_steel_blue: 'rgb(176,196,222)',
      lavender: 'rgb(230,230,250)',
      floral_white: 'rgb(255,250,240)',
      alice_blue: 'rgb(240,248,255)',
      ghost_white: 'rgb(248,248,255)',
      honeydew: 'rgb(240,255,240)',
      ivory: 'rgb(255,255,240)',
      azure: 'rgb(240,255,255)',
      snow: 'rgb(255,250,250)',
      black: 'rgb(0,0,0)',
      dim_gray: 'rgb(105,105,105)',
      gray: 'rgb(128,128,128)',
      dark_gray: 'rgb(169,169,169)',
      silver: 'rgb(192,192,192)',
      light_gray: 'rgb(211,211,211)',
      gainsboro: 'rgb(220,220,220)',
      white_smoke: 'rgb(245,245,245)',
      white: 'rgb(255,255,255)'
    };

    if (this.chartDaily) {
      this.chartDaily.destroy();
    }

    this.chartDaily = new Chart(this.chartRefDaily.nativeElement, {
      type: 'bar', // Type defines the variety of chart e.g. line, bar, pie etc
      data: {
        labels: dataset_date, // your labels array
        datasets: [
          // Weather Outdoor
          {
            label: 'Weather Outdoor - Max', // To label a particular data set
            data: dataset_weather_external_max_temp,
            backgroundColor: chartColors.orange, // array should have same number of elements as number of dataset
            borderColor: chartColors.orange, // array should have same number of elements as number of dataset
            borderWidth: 1.5,
            type: 'line',
            fill: false,
            datalabels: {
              align: 'end',
              anchor: 'start',
              color: 'blue',
            },
            yAxisID: 'B',
          },
          {
            label: 'Weather Outdoor - Min', // To label a particular data set
            data: dataset_weather_external_min_temp,
            backgroundColor: chartColors.blue, // array should have same number of elements as number of dataset
            borderColor: chartColors.blue, // array should have same number of elements as number of dataset
            borderWidth: 1.5,
            type: 'line',
            fill: false,
            datalabels: {
              align: 'end',
              anchor: 'start',
              color: 'blue',
            },
            yAxisID: 'B',
          },
          // Weather Bedroom
          {
            label: 'Weather Bedroom - Max', // To label a particular data set
            data: dataset_weather_bedroom_max_temp,
            backgroundColor: NoBasicChartColors.lime_green, // array should have same number of elements as number of dataset
            borderColor: NoBasicChartColors.lime_green, // array should have same number of elements as number of dataset
            borderWidth: 1.5,
            type: 'line',
            fill: false,
            datalabels: {
              align: 'end',
              anchor: 'start',
              color: 'blue',
            },
            yAxisID: 'B',
          },
          {
            label: 'Weather Bedroom - Min', // To label a particular data set
            data: dataset_weather_bedroom_min_temp,
            backgroundColor: NoBasicChartColors.lime, // array should have same number of elements as number of dataset
            borderColor: NoBasicChartColors.lime, // array should have same number of elements as number of dataset
            borderWidth: 1.5,
            type: 'line',
            fill: false,
            datalabels: {
              align: 'end',
              anchor: 'start',
              color: 'blue',
            },
            yAxisID: 'B',
          },
          {
            label: 'Sum boiler on', // To label a particular data set
            data: this.dataset_boiler_on,
            backgroundColor: chartColors.red, // array should have same number of elements as number of dataset
            borderColor: chartColors.red, // array should have same number of elements as number of dataset
            borderWidth: 1,
            fill: true,
            datalabels: {
              align: 'end',
              anchor: 'start',
            },
            yAxisID: 'A',
          },
          {
            label: 'Sum boiler off',
            data: dataset_boiler_off,
            backgroundColor: chartColors.green, // array should have same number of elements as number of dataset
            borderColor: chartColors.green, // array should have same number of elements as number of dataset
            borderWidth: 1,
            fill: true,
            datalabels: {
              align: 'start',
              anchor: 'end',
            },
            yAxisID: 'A',
          },
          {
            label: 'Total Hrs',
            data: dataset_total,
            backgroundColor: chartColors.grey, // array should have same number of elements as number of dataset
            borderColor: chartColors.grey,
            borderWidth: 1,
            // type: 'line', // Changes this dataset to become a line
            fill: true,
            datalabels: {
              // align: function(context) {
              //   var index = context.dataIndex;
              //   var value = context.dataset.data[index];
              //   return value < 24 ? 'end' : 'start';
              // },
              align: 'end',
              anchor: 'end',
            },
            yAxisID: 'A',
          },
          // {
          //   label: 'Weather Humidity', // To label a particular data set
          //   data: dataset_weather_external_hum,
          //   backgroundColor: chartColors.orange, // array should have same number of elements as number of dataset
          //   borderColor: chartColors.orange, // array should have same number of elements as number of dataset
          //   borderWidth: 1.5,
          //   type: 'line',
          //   fill: false,
          //   datalabels: {
          //     align: 'end',
          //     anchor: 'start',
          //     color: 'blue',
          //   },
          //   yAxisID: 'B',
          // },
        ],
      },
      plugins: [ChartDataLabels],
      options: {
        plugins: {
          datalabels: {
            color: 'black',
            // anchor: 'center',
            // align: 'center',
            rotation: -90,
            // formatter: Math.round,
            display: function(context) {
              return context.dataset.data[context.dataIndex] > 0;
            },
            font: {
              weight: 'normal',
            },
          },
        },
        responsive: true,
        legend: {
          display: true,
          position: 'top',
          labels: {
            fontColor: 'black',
          },
        },
        title: {
          display: true,
          position: 'top',
          text: 'Netatmo Boiler/Weather dashboard - Daily',
        },
        scales: {
          xAxes: [
            {
              stacked: true,
            },
          ],
          yAxes: [
            {
              id: 'A',
              type: 'linear',
              position: 'left',
              ticks: {
                stepSize: 1,
                suggestedMin: 0,
                suggestedMax: 26,
              },
            },
            {
              id: 'B',
              type: 'linear',
              position: 'right',
              ticks: {
                stepSize: 1,
                suggestedMin: 0,
                suggestedMax: 45,
              },
            },
          ],
        },
        tooltips: {
          enabled: true,
          mode: 'x',
        },
      },
    });
  }

  createBarChartMonthly() {
    const dataset_date: any = ([] = []);
    const dataset_boiler_on: any = ([] = []);
    const dataset_boiler_off: any = ([] = []);
    const dataset_total: any = ([] = []);

    for (const k in this.boilerMonthResult) {
      if (this.boilerMonthResult.hasOwnProperty(k)) {
        dataset_date.push(moment.unix(this.boilerMonthResult[k].date).format('DD/MM/YYYY'));
        dataset_boiler_on.push(this.boilerMonthResult[k].boiler_on);
        dataset_boiler_off.push(this.boilerMonthResult[k].boiler_off);
        dataset_total.push(this.boilerMonthResult[k].total);
      }
    }

    const chartColors = {
      red: 'rgb(255, 99, 132)',
      orange: 'rgb(255, 159, 64)',
      yellow: 'rgb(255, 205, 86)',
      green: 'rgb(75, 192, 192)',
      blue: 'rgb(54, 162, 235)',
      purple: 'rgb(153, 102, 255)',
      grey: 'rgb(201, 203, 207)',
    };
    if (this.chartMonthly) {
      this.chartMonthly.destroy();
    }

    this.chartMonthly = new Chart(this.chartRefchartMonthly.nativeElement, {
      type: 'horizontalBar', // Type defines the variety of chart e.g. line, bar, pie etc
      data: {
        labels: dataset_date, // your labels array
        datasets: [
          {
            label: 'Sum boiler on', // To label a particular data set
            data: dataset_boiler_on,
            backgroundColor: chartColors.red, // array should have same number of elements as number of dataset
            borderColor: chartColors.red, // array should have same number of elements as number of dataset
            borderWidth: 1,
            fill: true,
            datalabels: {
              align: 'center',
              anchor: 'center',
            },
          },
          {
            label: 'Sum boiler off',
            data: dataset_boiler_off,
            backgroundColor: chartColors.green, // array should have same number of elements as number of dataset
            borderColor: chartColors.green, // array should have same number of elements as number of dataset
            borderWidth: 1,
            fill: true,
            datalabels: {
              align: 'center',
              anchor: 'center',
            },
          },
          {
            label: 'Total Hrs',
            data: dataset_total,
            backgroundColor: chartColors.grey, // array should have same number of elements as number of dataset
            borderColor: chartColors.grey,
            borderWidth: 1,
            // type: 'line',           // Changes this dataset to become a line
            fill: true,
            datalabels: {
              align: 'center',
              anchor: 'end',
            },
          },
        ],
      },
      plugins: [ChartDataLabels],
      options: {
        plugins: {
          datalabels: {
            color: 'black',
            // anchor: 'center',
            // align: 'center',
            rotation: 0,
            formatter: Math.round,
            display: function(context) {
              return context.dataset.data[context.dataIndex] > 1;
            },
            font: {
              weight: 'normal',
            },
          },
        },
        responsive: true,
        legend: {
          display: true,
          position: 'top',
          labels: {
            fontColor: 'black',
          },
        },
        title: {
          display: true,
          position: 'top',
          text: 'Netatmo Boiler dashboard - Monthly',
        },
        scales: {
          yAxes: [
            {
              stacked: true,
            },
          ],
        },
        tooltips: {
          enabled: true,
          mode: 'y',
        },
      },
    });
  }
}
